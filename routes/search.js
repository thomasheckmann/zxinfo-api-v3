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

const config = require("../config.json")[process.env.NODE_ENV || "development"];
const express = require("express");
const router = express.Router();

const debug = require("debug")(`zxinfo-api-v3:${moduleId}`); // TODO: Change debug identifier

const tools = require("./utils");

const elasticsearch = require("elasticsearch");
const elasticClient = new elasticsearch.Client({
  host: config.es_host,
  apiVersion: config.es_apiVersion,
  log: "debug" /*config.es_log,*/,
  requestTimeout: 10000, // 10 second timeout for all requests
});

const es_index = config.zxinfo_index;

// Type expansion mappings for query normalization
const TYPE_EXPANSIONS = {
  ZXSPECTRUM: [
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
  ],
  ZX81: ["ZX81 64K", "ZX81 32K", "ZX81 2K", "ZX81 1K", "ZX81 16K"],
  PENTAGON: ["Scorpion", "Pentagon 128"],
  GAMES: ["Adventure Game", "Arcade Game", "Casual Game", "Game", "Sport Game", "Strategy Game"],
};

// Maintain backward compatibility with existing constants
const ZXSPECTRUM = TYPE_EXPANSIONS.ZXSPECTRUM;
const ZX81 = TYPE_EXPANSIONS.ZX81;
const PENTAGON = TYPE_EXPANSIONS.PENTAGON;
const GAMES = TYPE_EXPANSIONS.GAMES;

const queryTerm1 = {
  match_all: {},
};

function queryTermTitlesOnly(query) {
  return {
    bool: {
      should: [
        {
          match: {
            title: {
              query: query,
              boost: 6
            }
          },
        },
        {
          match_phrase: {
            title: {
              query: query,
              boost: 4
            }
          }
        },
        {
          match: {
            titlesuggest: { query: query, boost: 10 },
          },
        },
        {
          wildcard: { title: "*" + query + "*" }
        },
      ],
      minimum_should_match: 1,
    },
  };
}

/**
 * 
 *  Basic Query (without filters, aggregations etc...)
 */
function queryTerm2(query) {
  debug(`queryTerm2(${query})`);
  return {
    bool: {
      should: [
        {
          match: {
            title: {
              query: query,
              boost: 6
            }
          },
        },
        {
          match_phrase: {
            title: {
              query: query,
              boost: 4
            }
          }
        },
        {
          match: {
            titlesuggest: { query: query, boost: 10 },
          },
        },
        {
          wildcard: { title: "*" + query + "*" }
        },
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
            boost: 1.5,
          },
        },
        /* releases publisers */
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
            boost: 2,
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
                    match_phrase: {
                      "publishers.name": {
                        query: query
                      }
                    }
                  }
                ],
              },
            },
            boost: 8,
          },
        },
        /* authors name and group */
        {
          nested: {
            path: "authors",
            query: {
              bool: {
                should: [
                  {
                    match_phrase: {
                      "authors.name": {
                        query: query
                      }
                    }
                  },
                  {
                    match_phrase: {
                      "authors.groupName": {
                        query: query
                      }
                    }
                  },
                ], minimum_should_match: 1,

              },
            },
            boost: 2.5,
          },
        },
        /* */
        /* comments */
        {
          bool: {
            must: [
              {
                match: {
                  remarks: query,
                },
              },
            ],
            boost: 0,
          },
        },
        /* */
      ],
    },
  };
}

const createQueryTermWithFilters = function (query, filters, titlesonly, playabletype) {
  if (query == undefined || query.length == 0) {
    debug(`createQueryTermWithFilters() - empty query}`);
    const playabletype_should = createFilterItemPlayableType("playabletype", playabletype);
    if (playabletype) {
      debug(`filter: \n${JSON.stringify(playabletype_should, null, 4)}`);
      return {
        bool: {
          must: [queryTerm1, playabletype_should],
          filter: {
            bool: {
              must: filters,
            },
          },
        },
      };
    } else {
      debug(`no playabletype`);
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
    const playabletype_should = createFilterItemPlayableType("playabletype", playabletype);
    if (playabletype) {
      debug(`filter: \n${JSON.stringify(playabletype_should, null, 4)}`);
      return {
        bool: {
          must: [queryTermTitlesOnly(query), playabletype_should],
          filter: {
            bool: {
              must: filters,
            },
          },
        },
      };
    } else {
      debug(`no playabletype`);
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
    const playabletype_should = createFilterItemPlayableType("playabletype", playabletype);
    if (playabletype) {
      debug(`filter: \n${JSON.stringify(playabletype_should, null, 4)}`);
      return {
        bool: {
          must: [queryTerm2(query), playabletype_should],
          filter: {
            bool: {
              must: filters,
            },
          },
        },
      };
    } else {
      debug(`no playabletype`);
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

const createFilterItem = function (filterName, filterValues) {
  debug(`createFilterItem(${filterName}, ${filterValues})`);
  let item_should = {};

  if (filterValues !== undefined && filterValues.length > 0) {
    if (!Array.isArray(filterValues)) {
      filterValues = [filterValues];
    }
    let i = 0;
    const should = [];
    for (; i < filterValues.length; i++) {
      const item = {
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

/**
 * Filter by playable type:
 * TOSEC - TZX & TAP
 * SC - tzx.zip & tzp.zip
 */
const createFilterItemPlayableType = function (filterName, filterValues) {
  debug(`createFilterItemPlayableType(${filterName}, ${filterValues})`);
  let item_should = {};

  if (filterValues !== undefined && filterValues.length > 0) {
    if (!Array.isArray(filterValues)) {
      filterValues = [filterValues];
    }
    let i = 0;
    const should = [];
    for (; i < filterValues.length; i++) {
      const item = {
        regexp: {
          "tosec.path": {
            value: `.*(${filterValues[i].toLowerCase()}|${filterValues[i].toUpperCase()})`,
            flags: "ALL",
          },
        },
      };
      should.push(item);
    }

    i = 0;
    for (; i < filterValues.length; i++) {
      const item = {
        nested: {
          path: "releases.files",
          query: {
            bool: {
              must: [
                {
                  regexp: {
                    "releases.files.path": {
                      value: `.*(${filterValues[i].toLowerCase()}|${filterValues[i].toUpperCase()})\.(zip|ZIP)`,
                      flags: "ALL"
                    }
                  }
                }
              ]
            }
          }
        }
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

/**
 * Build elasticsearch search request with common parameters
 * @param {Object} queryObject - The query to execute
 * @param {number} page_size - Results per page
 * @param {number} fromOffset - Pagination offset
 * @param {string} outputmode - Output format
 * @param {boolean} includeAgg - Include aggregations
 * @param {Object} sortObject - Sort specification
 * @returns {Object} Elasticsearch search request
 */
function buildSearchRequest(queryObject, page_size, fromOffset, outputmode, includeAgg, sortObject) {
  const baseRequest = {
    timeout: "10s",
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
            bool: {
              should: [
                { exists: { field: "modificationOf.title" } },
                { exists: { field: "inspiredBy.title" } }
              ]
            }
          },
          negative_boost: 0.5,
        },
      },
      sort: sortObject,
    },
  };

  if (includeAgg) {
    // Note: aggregations are added by powerSearch based on filters
    baseRequest.includeAgg = true;
  }

  return baseRequest;
}

const powerSearch = function (searchObject, page_size, offset, outputmode, titlesonly, includeagg, explainId) {
  debug("powerSearch(): " + JSON.stringify(searchObject));

  if (Number.isInteger(parseInt(explainId)) && explainId.length < 8) {
    explainId = ("0000000" + explainId).slice(-7);
  }
  debug(`powerSearch(): explainId = ${explainId}`);

  const sort_object = tools.getSortObject(searchObject.sort);

  const filterObjects = {};

  const contenttype_should = createFilterItem("contentType", searchObject.contenttype);
  filterObjects["contenttype"] = contenttype_should;

  const xrated_should = createFilterItem("xrated", searchObject.xrated);
  filterObjects["xrated"] = xrated_should;

  //  const type_should = createFilterItem("type", searchObject.type);
  //  filterObjects["type"] = type_should;

  const genretype_should = createFilterItem("genreType", searchObject.genretype);
  filterObjects["genretype"] = genretype_should;

  const genresubtype_should = createFilterItem("genreSubType", searchObject.genresubtype);
  filterObjects["genresubtype"] = genresubtype_should;

  const machinetype_should = createFilterItem("machineType", searchObject.machinetype);
  filterObjects["machinetype"] = machinetype_should;

  const controls_should = createFilterItem("controls.control", searchObject.control);
  filterObjects["controls"] = controls_should;

  const multiplayermode_should = createFilterItem("multiplayerMode", searchObject.multiplayermode);
  filterObjects["multiplayermode"] = multiplayermode_should;

  const multiplayertype_should = createFilterItem("multiplayerType", searchObject.multiplayertype);
  filterObjects["multiplayertype"] = multiplayertype_should;

  const originalpublication_should = createFilterItem("originalPublication", searchObject.originalpublication);
  filterObjects["originalPublication"] = originalpublication_should;

  const availability_should = createFilterItem("availability", searchObject.availability);
  filterObjects["availability"] = availability_should;

  const language_should = createFilterItem("language", searchObject.language);
  filterObjects["language"] = language_should;

  const year_should = createFilterItem("originalYearOfRelease", searchObject.year);
  filterObjects["yearofrelease"] = year_should;

  const playabletype_should = createFilterItemPlayableType("playabletype", searchObject.tosectype);
  filterObjects["playabletype"] = playabletype_should;

  /**

    -- (C)ompetition - Tron256(17819) - competition
    -- (F)eature - Lunar Jetman(9372) - features
    -- (N)amed - LED Storm(9369) - series
    -- (T)hemed - Valhalla(7152) - themedgroup
    -- (U)Unnamed - Alpha-Beth(10966) - unsortedgroup

    */

  let grouptype_id = "";

  if (searchObject.group === "C") {
    grouptype_id = "competition";
  } else if (searchObject.group === "D") {
    grouptype_id = "demoParty";
  } else if (searchObject.group === "F") {
    grouptype_id = "features";
  } else if (searchObject.group === "G") {
    grouptype_id = "graphicalView";
  } else if (searchObject.group === "L") {
    grouptype_id = "programmingLanguage";
  } else if (searchObject.group === "M") {
    grouptype_id = "screenMovement";
  } else if (searchObject.group === "P") {
    grouptype_id = "sport";
  } else if (searchObject.group === "R") {
    grouptype_id = "copyright";
    //  } else if (searchObject.group === "N") {
    //    grouptype_id = "series";
  } else if (searchObject.group === "T") {
    grouptype_id = "themedGroup";
  } else if (searchObject.group === "U") {
    grouptype_id = "unsortedGroup";
  } else if (searchObject.group === "X") {
    grouptype_id = "crossPlatform";
  } else if (searchObject.group === "Z") {
    grouptype_id = "featuresZX81";
  }


  let groupandname_must = {};
  if (searchObject.group !== undefined && searchObject.groupname !== undefined) {
    const groupBools = [];
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
  const filters = [];
  const filterNames = Object.keys(filterObjects);
  for (let i = 0; i < filterNames.length; i++) {
    const item = filterObjects[filterNames[i]];
    const itemsize = Object.keys(item).length;
    if (itemsize > 0) {
      filters.push(item);
    }
  }

  debug(`powerSearch(): filters=${JSON.stringify(filters)}`);
  const query = createQueryTermWithFilters(searchObject.query, filters, titlesonly, searchObject.tosectype);
  // console.log('query: ' + JSON.stringify(query, null, 4));
  const aggfilter = [
    query,
    contenttype_should,
    xrated_should,
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

  let fromOffset, queryObject;

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

  if (explainId !== undefined) {
    return elasticClient.explain({
      _source: tools.es_source_list(outputmode),
      _source_excludes: "titlesuggest, metadata_author,authorsuggest",
      index: es_index,
      id: explainId,
      body: {
        query: {
          boosting: {
            positive: queryObject,
            negative: {
              bool: {
                should: [
                  {
                    exists: {
                      field: "modificationOf.title",
                    },
                  },
                  {
                    exists: {
                      field: "inspiredBy.title",
                    },
                  }
                ]
              }
            },
            negative_boost: 0.5,
          },
        },
      },
    });
  } else if (includeagg === undefined || includeagg === "false")
    return elasticClient.search({
      timeout: "10s",
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
              bool: {
                should: [
                  {
                    exists: {
                      field: "modificationOf.title",
                    },
                  },
                  {
                    exists: {
                      field: "inspiredBy.title",
                    },
                  },
                ]
              }
            },
            negative_boost: 0.5,
          },
        },
        sort: sort_object,
      },
    });
  else
    return elasticClient.search({
      timeout: "10s",
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
              bool: {
                should: [
                  {
                    exists: {
                      field: "modificationOf.title",
                    },
                  },
                  {
                    exists: {
                      field: "inspiredBy.title",
                    },
                  }
                ]
              }
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
              /**
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
 */
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
router.use((req, res, next) => {
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

/**
 * Expand query type aliases (e.g., ZXSPECTRUM -> individual spectrum versions)
 * @param {string} type - Type name to expand
 * @param {string} typeKey - Key to look up in query (e.g., 'machinetype' or 'genretype')
 * @returns {Array} Expanded list of types or original type if not found
 */
function expandType(type, typeKey) {
  const expansionKey = typeKey === 'machinetype' 
    ? (type === 'ZXSPECTRUM' ? 'ZXSPECTRUM' : type === 'ZX81' ? 'ZX81' : type === 'PENTAGON' ? 'PENTAGON' : null)
    : typeKey === 'genretype'
    ? (type === 'GAMES' ? 'GAMES' : null)
    : null;
  
  return expansionKey && TYPE_EXPANSIONS[expansionKey] ? TYPE_EXPANSIONS[expansionKey] : [type];
}

router.get("/", async function (req, res, next) {
  try {
    debug("==> /search");

    // set default values for mode, size & offset
    req.query = tools.setDefaultValuesModeSizeOffsetSort(req.query);

    // validate pagination parameters to prevent DoS
    const size = Math.min(Math.max(parseInt(req.query.size) || 50, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    req.query.size = size;
    req.query.offset = offset;
    debug(`Validated pagination: size=${size}, offset=${offset}`);

    // Expand type aliases in query parameters
    if (req.query.machinetype) {
      if (!Array.isArray(req.query.machinetype)) {
        req.query.machinetype = [req.query.machinetype];
      }
      req.query.machinetype = req.query.machinetype.flatMap(t => {
        const expanded = expandType(t, 'machinetype');
        debug(`Expanded machinetype: ${t} -> ${JSON.stringify(expanded)}`);
        return expanded;
      });
    }

    if (req.query.genretype) {
      if (!Array.isArray(req.query.genretype)) {
        req.query.genretype = [req.query.genretype];
      }
      req.query.genretype = req.query.genretype.flatMap(t => {
        const expanded = expandType(t, 'genretype');
        debug(`Expanded genretype: ${t} -> ${JSON.stringify(expanded)}`);
        return expanded;
      });
    }

    const result = await powerSearch(
      req.query,
      req.query.size,
      req.query.offset,
      req.query.mode,
      req.query.titlesonly,
      req.query.includeagg,
      req.query.explain
    );

    debug(`########### RESPONSE from search(${req.query.size}, ${req.query.offset}, ${req.query.mode})`);
    debug(result);
    debug(`#############################################################`);

    if (req.query.explain !== undefined) {
      res.send(result);
    } else {
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
  } catch (err) {
    debug(`Search error: ${err.message}`);
    debug(err.stack);
    res.status(503).json({ error: "Search service unavailable", message: err.message });
  }
});

module.exports = router;
