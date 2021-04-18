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

// constans for machinetype
const ZXSPECTRUM = [
  "ZX-Spectrum 128 +2",
  "ZX-Spectrum 128 +2A/+3",
  "ZX-Spectrum 128 +2B",
  "ZX-Spectrum 128 +3",
  "ZX-Spectrum 128K",
  "ZX-Spectrum 128K (load in USR0 mode)",
  "ZX-Spectrum 16K",
  "ZX-Spectrum 16K/48K",
  "ZX-Spectrum 48K",
  "ZX-Spectrum 48K/128K",
];
const ZX81 = ["ZX81 64K", "ZX81 32K", "ZX81 2K", "ZX81 1K", "ZX81 16K"];
const PENTAGON = ["Scorpion", "Pentagon 128"];

// constans for genretype
const GAMES = ["Adventure Game", "Arcade Game", "Casual Game", "Game", "Sport Game", "Strategy Game"];

var queryTerm1 = {
  match_all: {},
};

function queryTermTitlesOnly(query) {
  return {
    bool: {
      should: [
        {
          multi_match: {
            query: query,
            fields: ["title"],
          },
        },
        {
          match: {
            titlesuggest: query,
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

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
          bool: {
            must: [
              {
                match: {
                  "publishers.notes.text": query,
                },
              },
            ],
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

var createQueryTermWithFilters = function (query, filters, titlesonly, tosectype) {
  if (query == undefined || query.length == 0) {
    debug(`createQueryTermWithFilters() - empty query}`);
    var tosectype_should = createFilterItemTosecType("tosectype", tosectype);
    if (tosectype) {
      debug(`filter: \n${JSON.stringify(tosectype_should, null, 4)}`);
      return {
        bool: {
          must: [queryTerm1, tosectype_should],
          filter: {
            bool: {
              must: filters,
            },
          },
        },
      };
    } else {
      debug(`no tosectype`);
      return {
        bool: {
          must: [queryTerm1],
          filter: {
            bool: {
              must: filters,
            },
          },
        },
      };
    }
  } else if (titlesonly !== undefined && titlesonly === "true") {
    debug(`createQueryTermWithFilters() - titlesonly`);
    var tosectype_should = createFilterItemTosecType("tosectype", tosectype);
    if (tosectype) {
      debug(`filter: \n${JSON.stringify(tosectype_should, null, 4)}`);
      return {
        bool: {
          must: [queryTermTitlesOnly(query), tosectype_should],
          filter: {
            bool: {
              must: filters,
            },
          },
        },
      };
    } else {
      debug(`no tosectype`);
      return {
        bool: {
          must: [queryTermTitlesOnly(query)],
          filter: {
            bool: {
              must: filters,
            },
          },
        },
      };
    }
  } else {
    debug(`createQueryTermWithFilters() - normal search`);
    debug(`queryTerm2: \n${JSON.stringify(queryTerm2(query), null, 4)}`);
    var tosectype_should = createFilterItemTosecType("tosectype", tosectype);
    if (tosectype) {
      debug(`filter: \n${JSON.stringify(tosectype_should, null, 4)}`);
      return {
        bool: {
          must: [queryTerm2(query), tosectype_should],
          filter: {
            bool: {
              must: filters,
            },
          },
        },
      };
    } else {
      debug(`no tosectype`);
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
    }
  }
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

    item_should = { bool: { should: should, minimum_should_match: 1 } };
  }
  debug(JSON.stringify(item_should));
  return item_should;
};

var createFilterItemTosecType = function (filterName, filterValues) {
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
        regexp: {
          "tosec.path": {
            value: `.*(${filterValues[i].toLowerCase()}|${filterValues[i].toUpperCase()})`,
            flags: "ALL",
          },
        },
      };
      should.push(item);
    }

    item_should = { bool: { should: should, minimum_should_match: 1 } };
  }
  debug(JSON.stringify(item_should));
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

var powerSearch = function (searchObject, page_size, offset, outputmode, titlesonly, includeagg) {
  debug("powerSearch(): " + JSON.stringify(searchObject));

  var sort_object = tools.getSortObject(searchObject.sort);

  var filterObjects = {};

  var contenttype_should = createFilterItem("contentType", searchObject.contenttype);
  filterObjects["contenttype"] = contenttype_should;

  //  var type_should = createFilterItem("type", searchObject.type);
  //  filterObjects["type"] = type_should;

  var genretype_should = createFilterItem("genreType", searchObject.genretype);
  filterObjects["genretype"] = genretype_should;

  var genresubtype_should = createFilterItem("genreSubType", searchObject.genresubtype);
  filterObjects["genresubtype"] = genresubtype_should;

  var machinetype_should = createFilterItem("machineType", searchObject.machinetype);
  filterObjects["machinetype"] = machinetype_should;

  var controls_should = createFilterItem("controls.control", searchObject.control);
  filterObjects["controls"] = controls_should;

  var multiplayermode_should = createFilterItem("multiplayerMode", searchObject.multiplayermode);
  filterObjects["multiplayermode"] = multiplayermode_should;

  var multiplayertype_should = createFilterItem("multiplayerType", searchObject.multiplayertype);
  filterObjects["multiplayertype"] = multiplayertype_should;

  var originalpublication_should = createFilterItem("originalPublication", searchObject.originalpublication);
  filterObjects["originalpublication"] = originalpublication_should;

  var availability_should = createFilterItem("availability", searchObject.availability);
  filterObjects["availability"] = availability_should;

  var language_should = createFilterItem("language", searchObject.language);
  filterObjects["language"] = language_should;

  var year_should = createFilterItem("originalYearOfRelease", searchObject.year);
  filterObjects["yearofrelease"] = year_should;

  var tosectype_should = createFilterItemTosecType("tosectype", searchObject.tosectype);
  filterObjects["tosectype"] = tosectype_should;
  /**

    -- (C)ompetition - Tron256(17819) - competition
    -- (F)eature - Lunar Jetman(9372) - features
    -- (N)amed - LED Storm(9369) - series
    -- (T)hemed - Valhalla(7152) - themedgroup
    -- (U)Unnamed - Alpha-Beth(10966) - unsortedgroup

    */

  var grouptype_id = "";

  if (searchObject.group === "C") {
    grouptype_id = "competition";
  } else if (searchObject.group === "F") {
    grouptype_id = "features";
  } else if (searchObject.group === "N") {
    grouptype_id = "series";
  } else if (searchObject.group === "T") {
    grouptype_id = "themedGroup";
  } else if (searchObject.group === "U") {
    grouptype_id = "unsortedGroup";
  }

  var groupandname_must = {};
  if (searchObject.group !== undefined && searchObject.groupname !== undefined) {
    var groupBools = [];
    groupBools.push({
      bool: {
        must: {
          match: {
            [grouptype_id + ".name"]: searchObject.groupname,
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

  debug(`powerSearch(): filters=${JSON.stringify(filters)}`);
  var query = createQueryTermWithFilters(searchObject.query, filters, titlesonly, searchObject.tosectype);

  var aggfilter = [
    query,
    contenttype_should,
    genretype_should,
    genresubtype_should,
    machinetype_should,
    controls_should,
    multiplayermode_should,
    multiplayertype_should,
    originalpublication_should,
    availability_should,
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

  if (includeagg === undefined || includeagg === "false")
    return elasticClient.search({
      _source: tools.es_source_list(outputmode),
      _source_excludes: "titlesuggest, metadata_author,authorsuggest",
      index: es_index,
      body: {
        track_scores: true,
        size: page_size,
        from: fromOffset,
        query: {
          boosting: {
            positive: queryObject,
            negative: {
              exists: {
                field: "modificationOf.title",
              },
            },
            negative_boost: 0.5,
          },
        },
        sort: sort_object,
      },
    });
  else
    return elasticClient.search({
      _source: tools.es_source_list(outputmode),
      _source_excludes: "titlesuggest, metadata_author,authorsuggest",
      index: es_index,
      body: {
        track_scores: true,
        size: page_size,
        from: fromOffset,
        query: {
          boosting: {
            positive: queryObject,
            negative: {
              exists: {
                field: "modificationOf.title",
              },
            },
            negative_boost: 0.5,
          },
        },
        sort: sort_object,
        aggregations: {
          all_entries: {
            global: {},
            aggregations: {
              aggMachineTypes: {
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
              aggControls: {
                filter: {
                  bool: {
                    must: removeFilter(aggfilter, controls_should),
                  },
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
              aggMultiplayerMode: {
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
              aggMultiplayerType: {
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
              aggOriginalPublication: {
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
              aggAvailability: {
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
              aggType: {
                filter: {
                  bool: {
                    must: removeFilter(aggfilter, genretype_should),
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
              aggSubType: {
                filter: {
                  bool: {
                    must: removeFilter(aggfilter, genresubtype_should),
                  },
                },
                aggregations: {
                  filtered_type: {
                    terms: {
                      size: 100,
                      field: "genreSubType",
                      order: {
                        _key: "asc",
                      },
                    },
                  },
                },
              },
              aggLanguage: {
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
              aggOriginalYearOfRelease: {
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

  // set default values for mode, size & offset
  req.query = tools.setDefaultValuesModeSizeOffsetSort(req.query);

  if (req.query.machinetype) {
    var mTypes = [];
    if (!Array.isArray(req.query.machinetype)) {
      req.query.machinetype = [req.query.machinetype];
    }

    for (var i = 0; i < req.query.machinetype.length; i++) {
      debug(`${i} - ${req.query.machinetype[i]}`);
      switch (req.query.machinetype[i]) {
        case "ZXSPECTRUM":
          debug("- ZXSPECTRUM -");
          mTypes = mTypes.concat(ZXSPECTRUM);
          break;
        case "ZX81":
          debug("- ZX81 -");
          mTypes = mTypes.concat(ZX81);
          break;
        case "PENTAGON":
          debug("- PENTAGON -");
          mTypes = mTypes.concat(PENTAGON);
          break;
        default:
          mTypes.push(req.query.machinetype[i]);
          break;
      }
    }
    req.query.machinetype = mTypes;
    debug(`mType: ${mTypes}`);
  }
  if (req.query.genretype) {
    var gTypes = [];
    if (!Array.isArray(req.query.genretype)) {
      req.query.genretype = [req.query.genretype];
    }

    for (var i = 0; i < req.query.genretype.length; i++) {
      debug(`${i} - ${req.query.genretype[i]}`);
      switch (req.query.genretype[i]) {
        case "GAMES":
          debug("- GAMES -");
          gTypes = gTypes.concat(GAMES);
          break;
        default:
          gTypes.push(req.query.genretype[i]);
          break;
      }
    }
    req.query.genretype = gTypes;
    debug(`mType: ${gTypes}`);
  }

  powerSearch(req.query, req.query.size, req.query.offset, req.query.mode, req.query.titlesonly, req.query.includeagg).then(
    function (result) {
      debug(
        `########### RESPONSE from powerSearch(${req.params.query},${req.query.size}, ${req.query.offset}, ${req.query.mode})`
      );
      debug(result);
      debug(`#############################################################`);

      res.header("X-Total-Count", result.hits.total.value);
      if (req.query.output === "simple") {
        res.send(tools.renderSimpleOutput(result));
      } else if (req.query.output === "flat") {
        res.header("content-type", "text/plain;charset=UTF-8");
        res.send(tools.renderFlatOutputEntries(result));
      } else {
        res.send(result);
      }
    }
  );
});

module.exports = router;
