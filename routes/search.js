/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:search* nodemon --ignorpublic/javascripts/config.js --exec npm start
 *
 * Search priority:
 *
 * title - (2.0)
 * titlesuggest
 * authorsuggest
 * releases.releaseTitles - (1.9) (alternative release title)
 * 		- Foot and mouth -> Head over heels
 * 		- Arcade collection 12 -> Head over heels (not main release)
 * 		- Piloto de Guerra -> Figther Pilot (not main release)
 * publishers.name (1.5)
 * authors.name (1.4)
 * publishers.releases.name (1.3) (re-release publisher)
 * 		- IBSA
 * 		- Hit Squad
 * authors.groupName (1.0)
 *
 * parameters:
 * 		- sort = ["title_asc", "title_desc", "date_asc", "date_desc", "rel_asc", "rel_desc"]
 * 		- mode = ["full", "compact", "tiny"]
 * 		- contenttype = ["SOFTWARE", "BOOK", "HARDWARE"]
 * 		- type =
 */

"use strict";

const moduleId = "search";

var config = require("../config.json")[process.env.NODE_ENV || "development"];
var express = require("express");
var router = express.Router();

var debug = require("debug")(`zxinfo-api-v3:${moduleId}`); // TODO: Change debug identifier

var tools = require("./utils");

var elasticsearch = require("elasticsearch");
var elasticClient = new elasticsearch.Client({
  host: config.es_host,
  apiVersion: config.es_apiVersion,
  log: "error" /*config.es_log,*/,
});

var es_index = config.zxinfo_index;

var queryTerm1 = {
  match_all: {},
};

function queryTerm2(query) {
  debug(`queryTerm2(${query})`);
  return {
    bool: {
      should: [
        {
          multi_match: {
            query: query,
            fields: ["title"],
            fuzziness: "AUTO",
            boost: 2.0,
          },
        },
        {
          match: {
            titlesuggest: query,
          },
        },
        {
          match: {
            authorsuggest: query,
          },
        },
        /* release titles / aliases */
        {
          nested: {
            path: "releases",
            query: {
              bool: {
                must: [
                  {
                    match_phrase_prefix: {
                      "releases.releaseTitles": query,
                    },
                  },
                ],
              },
            },
            boost: 1.9,
          },
        },
        /* */
        /* publisher names */
        {
          nested: {
            path: "publishers",
            query: {
              bool: {
                must: [
                  {
                    match: {
                      "publishers.name": query,
                    },
                  },
                ],
              },
            },
            boost: 1.5,
          },
        },
        /* */
        /* authors names */
        {
          nested: {
            path: "authors",
            query: {
              bool: {
                must: [
                  {
                    multi_match: {
                      query: query,
                      fields: ["authors.name", "authors.groupName"],
                    },
                  },
                ],
              },
            },
            boost: 1.5,
          },
        },
        /* */
        /* publisher names */
        {
          nested: {
            path: "releases.publishers",
            query: {
              bool: {
                must: [
                  {
                    match: {
                      "releases.publishers.name": query,
                    },
                  },
                ],
              },
            },
            boost: 1.3,
          },
        },
        /* */
        /* authors group name */
        {
          nested: {
            path: "authors",
            query: {
              bool: {
                must: [
                  {
                    match: {
                      "authors.groupName": query,
                    },
                  },
                ],
              },
            },
            boost: 1.3,
          },
        },
        /* */
        /* publishers note */
        {
          nested: {
            path: "publishers.notes",
            query: {
              bool: {
                must: [
                  {
                    match: {
                      "publishers.notes.text": query,
                    },
                  },
                ],
              },
            },
            boost: 1.2,
          },
        },
        /* */
        /* comments */
        {
          match: {
            remarks: "to show gary",
          },
        },
        /* */
      ],
    },
  };
}

var createQueryTermWithFilters = function (query, filters) {
  if (query == undefined || query.length == 0) {
    debug("empty query, return all");
    return {
      bool: {
        must: queryTerm1,
        filter: {
          bool: {
            must: filters,
          },
        },
      },
    };
  }

  return {
    bool: {
      must: [queryTerm2(query)],
      filter: {
        bool: {
          must: filters,
        },
      },
    },
  };
};

var createFilterItem = function (filterName, filterValues) {
  debug(`createFilterItem(${filterName}, ${filterValues})`);
  var item_should = {};

  if (filterValues !== undefined && filterValues.length > 0) {
    if (!Array.isArray(filterValues)) {
      filterValues = [filterValues];
    }
    var i = 0;
    var should = [];
    for (; i < filterValues.length; i++) {
      var item = {
        match: {
          [filterName]: filterValues[i],
        },
      };
      should.push(item);
    }

    item_should = { bool: { should: should } };
  }
  debug(JSON.stringify(item_should));
  return item_should;
};

var createFilterNestedItem = function (filterName, path, filterValues) {
  var item_should = {};

  if (filterValues !== undefined && filterValues.length > 0) {
    if (!Array.isArray(filterValues)) {
      filterValues = [filterValues];
    }
    var i = 0;
    var should = [];
    for (; i < filterValues.length; i++) {
      var item = {
        match: {
          [filterName + "." + path]: filterValues[i],
        },
      };
      should.push(item);
    }

    item_should = { bool: { should: [{ nested: { path: filterName, query: { bool: { should: should } } } }] } };
  }
  return item_should;
};

/**
 * Helper for aggregation - each aggregation should include all filters, except its own
 */
function removeFilter(filters, f) {
  const index = filters.indexOf(f);
  filters.splice(index, 1);
  return filters.filter((value) => Object.keys(value).length !== 0);
}

var powerSearch = function (searchObject, page_size, offset, outputmode) {
  debug("powerSearch(): " + JSON.stringify(searchObject));

  // title_asc, title_desc, date_asc, date_desc
  var sort_mode = searchObject.sort == undefined ? "rel_desc" : searchObject.sort;
  var sort_object = tools.getSortObject(sort_mode);

  var filterObjects = {};

  var contenttype_should = createFilterItem("contentType", searchObject.contenttype);
  filterObjects["contenttype"] = contenttype_should;

  var genretype_should = createFilterItem("genreType", searchObject.genretype);
  filterObjects["genretype"] = genretype_should;

  var genresubtype_should = createFilterItem("subtype", searchObject.genresubtype);
  filterObjects["genresubtype"] = genresubtype_should;

  var machinetype_should = createFilterItem("machineType", searchObject.machinetype);
  filterObjects["machinetype"] = machinetype_should;

  var controls_should = createFilterNestedItem("controls", "control", searchObject.control);
  filterObjects["controls"] = controls_should;

  var multiplayermode_should = createFilterItem("multiplayerMode", searchObject.multiplayermode);
  filterObjects["multiplayermode"] = multiplayermode_should;

  var multiplayertype_should = createFilterItem("multiplayerType", searchObject.multiplayertype);
  filterObjects["multiplayertype"] = multiplayertype_should;

  var originalpublication_should = createFilterItem("originalPublication", searchObject.originalpublication);
  filterObjects["originalpublication"] = originalpublication_should;

  var availability_should = createFilterItem("availability", searchObject.availability);
  filterObjects["availability"] = availability_should;

  var type_should = createFilterItem("type", searchObject.type);
  filterObjects["type"] = type_should;

  var language_should = createFilterItem("language", searchObject.language);
  filterObjects["language"] = language_should;

  var year_should = createFilterItem("originalYearOfRelease", searchObject.year);
  filterObjects["yearofrelease"] = year_should;

  /**

    -- (C)ompetition - Tron256(17819) - competition
    -- (F)eature - Lunar Jetman(9372) - features
    -- (M)ajor Clone - Gulpman(2175) - majorclone
    -- (N)amed - LED Storm(9369) - series
    -- (T)hemed - Valhalla(7152) - themedgroup
    -- (U)Unnamed - Alpha-Beth(10966) - unsortedgroup

    */

  var grouptype_id = "";

  if (searchObject.group === "C") {
    grouptype_id = "competition";
  } else if (searchObject.group === "F") {
    grouptype_id = "features";
  } else if (searchObject.group === "M") {
    grouptype_id = "majorclone";
  } else if (searchObject.group === "N") {
    grouptype_id = "series";
  } else if (searchObject.group === "T") {
    grouptype_id = "themedgroup";
  } else if (searchObject.group === "U") {
    grouptype_id = "unsortedgroup";
  }

  var groupandname_must = {};
  if (searchObject.group !== undefined && searchObject.groupname !== undefined) {
    var groupBools = [];
    groupBools.push({
      nested: {
        path: grouptype_id,
        query: {
          bool: {
            must: {
              match: {
                [grouptype_id + ".name"]: searchObject.groupname,
              },
            },
          },
        },
      },
    });
    groupandname_must = { bool: { must: groupBools } };
    filterObjects["groupandname"] = groupandname_must;
  }

  // generate array with filter objects
  var filters = [];
  var filterNames = Object.keys(filterObjects);
  for (var i = 0; i < filterNames.length; i++) {
    var item = filterObjects[filterNames[i]];
    var itemsize = Object.keys(item).length;
    if (itemsize > 0) {
      filters.push(item);
    }
  }

  var query = createQueryTermWithFilters(searchObject.query, filters);

  var aggfilter = [
    query,
    contenttype_should,
    genresubtype_should,
    machinetype_should,
    controls_should,
    multiplayermode_should,
    multiplayertype_should,
    originalpublication_should,
    availability_should,
    type_should,
    language_should,
    year_should,
  ];

  // random X, if offset=random, size max 10

  var fromOffset, queryObject;

  if (offset === "random") {
    if (page_size > 10) {
      page_size = 10;
    }
    fromOffset = 0;
    queryObject = {
      function_score: {
        query: query,
        functions: [
          {
            random_score: { seed: Date.now() },
          },
        ],
      },
    };

    sort_object = [
      {
        _score: {
          order: "asc",
        },
      },
    ];
  } else {
    fromOffset = offset * page_size;
    queryObject = query;
  }

  /* DEBUG
  const fs = require("fs");
  fs.writeFileSync("createQueryTermWithFilters.json", JSON.stringify(query));
  fs.writeFileSync("queryObject.json", JSON.stringify(queryObject));
*/
  return elasticClient.search({
    _source: tools.es_source_list(outputmode),
    _source_excludes: "titlesuggest, metadata_author,authorsuggest",
    filter_path: "-hits.hits.sort,-hits.hits.highlight,-hits.hits._explanation",
    index: es_index,
    body: {
      explain: true,
      track_scores: true,
      size: page_size,
      from: fromOffset,
      query: {
        boosting: {
          positive: queryObject,
          negative: {
            nested: {
              path: "modificationOf",
              query: {
                match: {
                  "modificationOf.isMod": "1",
                },
              },
            },
          },
          negative_boost: 0.5,
        },
      },
      sort: sort_object,
      highlight: {
        fields: {
          fulltitle: {},
          alsoknownas: {},
          /*"releases.as_title": {},*/
          "publishers.name": {},
          "releases.name": {},
          "authors..name": {},
          /*"authors.authors.alias": {},*/
          "authors.groupName": {},
        },
      },
      aggregations: {
        all_entries: {
          global: {},
          aggregations: {
            machinetypes: {
              filter: {
                bool: {
                  must: removeFilter(aggfilter, machinetype_should),
                },
              },
              aggregations: {
                filtered_machinetypes: {
                  terms: {
                    size: 100,
                    field: "machineType",
                    order: {
                      _key: "desc",
                    },
                  },
                },
              },
            },
            controls: {
              filter: {
                bool: {
                  must: removeFilter(aggfilter, controls_should),
                },
              },
              aggregations: {
                controls: {
                  nested: {
                    path: "controls",
                  },
                  aggregations: {
                    filtered_controls: {
                      terms: {
                        size: 100,
                        field: "controls.control",
                        order: {
                          _key: "asc",
                        },
                      },
                    },
                  },
                },
              },
            },
            multiplayermode: {
              filter: {
                bool: {
                  must: removeFilter(aggfilter, multiplayermode_should),
                },
              },
              aggregations: {
                filtered_multiplayermode: {
                  terms: {
                    size: 100,
                    field: "multiplayerMode",
                    order: {
                      _key: "asc",
                    },
                  },
                },
              },
            },
            multiplayertype: {
              filter: {
                bool: {
                  must: removeFilter(aggfilter, multiplayertype_should),
                },
              },
              aggregations: {
                filtered_multiplayertype: {
                  terms: {
                    size: 100,
                    field: "multiplayerType",
                    order: {
                      _key: "asc",
                    },
                  },
                },
              },
            },
            originalpublication: {
              filter: {
                bool: {
                  must: removeFilter(aggfilter, originalpublication_should),
                },
              },
              aggregations: {
                filtered_originalpublication: {
                  terms: {
                    size: 100,
                    field: "originalPublication",
                    order: {
                      _key: "asc",
                    },
                  },
                },
              },
            },
            availability: {
              filter: {
                bool: {
                  must: removeFilter(aggfilter, availability_should),
                },
              },
              aggregations: {
                filtered_availability: {
                  terms: {
                    size: 100,
                    field: "availability",
                    order: {
                      _key: "asc",
                    },
                  },
                },
              },
            },
            type: {
              filter: {
                bool: {
                  must: removeFilter(aggfilter, type_should),
                },
              },
              aggregations: {
                filtered_type: {
                  terms: {
                    size: 100,
                    field: "genreType",
                    order: {
                      _key: "asc",
                    },
                  },
                },
              },
            },
            language: {
              filter: {
                bool: {
                  must: removeFilter(aggfilter, language_should),
                },
              },
              aggregations: {
                filtered_language: {
                  terms: {
                    size: 100,
                    field: "language",
                    order: {
                      _key: "asc",
                    },
                  },
                },
              },
            },
            year: {
              filter: {
                bool: {
                  must: removeFilter(aggfilter, year_should),
                },
              },
              aggregations: {
                filtered_year: {
                  terms: {
                    size: 100,
                    field: "originalYearOfRelease",
                    order: {
                      _key: "asc",
                    },
                  },
                },
              },
            },
            /** insert new AGG here */
          },
        },
      },
    }, // end body
  });
};

/************************************************
 *
 * common to use for all requests
 *
 ************************************************/
router.use(function (req, res, next) {
  debug(`got request - start processing, path: ${req.path}`);
  debug(`user-agent: ${req.headers["user-agent"]}`);
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  // do logging
  next(); // make sure we go to the next routes and don't stop here
});

/************************************************
 *
 * requests served by this endpoint
 *
 ************************************************/

router.get("/", function (req, res, next) {
  debug("==> /search");
  powerSearch(req.query, req.query.size, req.query.offset, req.query.mode).then(function (result) {
    debug(`########### RESPONSE from powerSearch(${req.params.query},${req.query.size}, ${req.query.offset}, ${req.query.mode})`);
    debug(result);
    debug(`#############################################################`);

    // debug(result.aggregations.all_entries.multiplayertype);
    res.header("X-Total-Count", result.hits.total);
    res.send(result);
  });
});

router.get("/", (req, res) => {
  console.log(`[CATCH ALL - ${moduleId}]`);
  console.log(req.path);
  res.send(`Hello World from /${moduleId}`);
});

module.exports = router;