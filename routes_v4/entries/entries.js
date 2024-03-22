"use strict";

const moduleId = "entries";
const debug = require("debug")(`zxinfo-api-v4:${moduleId}`);
const tools = require("../../routes/utils");
const helpers = require("../helpersRequest");
const queryHelper = require("../search/queryTerms");
const search = require("../helpersSearch");

var express = require("express");
var router = express.Router();

const config = require("../../config.json")[process.env.NODE_ENV || "development"];
const es_index = config.zxinfo_index;
const elasticsearch = require("elasticsearch");
var elasticClient = new elasticsearch.Client({
  host: config.es_host,
  apiVersion: config.es_apiVersion,
  log: config.es_log,
});

/**
 * Test case:
 *      - pick game from frontpage (or result page)
 *      - direct link to detail page '/details/0002259'
 *
 * Notes:
 *      - TODO: Invalid ID is not handled in any way
 */
var getEntryById = function (entryid, outputmode) {
  debug(`getEntryById() : ${entryid}, outputmode: ${outputmode}`);

  return elasticClient.get({
    _source: tools.es_source_item(outputmode),
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    index: es_index,
    id: entryid,
  });
};

/************************************************
 *
 * common to use for all requests
 *
 ************************************************/
router.use(function (req, res, next) {
  helpers.defaultRouter(moduleId, debug, req, res, next);
});

/************************************************
 *
 * requests served by this endpoint
 *
 ************************************************/

/**
    Return game with :gameid
*/
router.get("/entries/:entryid", function (req, res, next) {
  debug("==> /entries/:entryid");
  debug(
    `entryid: ${req.params.entryid}, len: ${req.params.entryid.length}, isInt: ${Number.isInteger(parseInt(req.params.entryid))}`
  );

  if (Number.isInteger(parseInt(req.params.entryid)) && req.params.entryid.length < 8) {
    const id = ("0000000" + req.params.entryid).slice(-7);

    getEntryById(id, req.query.mode).then(
      function (result) {
        debug(`########### RESPONSE from getEntryById(${id},${req.query.mode})`);
        debug(result);
        debug(`#############################################################`);
        //res.send(tools.renderMagazineLinks(result));
        if (req.query.output === "flat") {
          res.header("content-type", "text/plain;charset=UTF-8");
          res.send(tools.renderFlatOutputEntry(result));
        } else {
          res.send(result);
        }
      },
      function (reason) {
        debug(`[FAILED] reason: ${reason.message}`);
        if (reason.message === "Not Found") {
          res.status(404).end();
        } else {
          res.status(500).end();
        }
      }
    );
  } else {
    res.status(400).end();
  }
});

router.get("/entries/byletter/:letter", function (req, res, next) {
  debug(`==> /entries/byletter/ [${req.params.letter}]`);

  const sortObject = tools.getSortObject(req.query.sort);
  const filterQuery = queryHelper.createFilterQuery(req);

  var letter = req.params.letter.toLowerCase();

  var expr;
  if (letter === "#") {
    expr = "[0-9].*";
  } else {
    expr = "[" + letter.toLowerCase() + letter.toUpperCase() + "].*";
  }

  // base query
  var qLetter =
  {
    regexp: {
      "title.keyword": {
        value: expr,
        flags: "ALL",
      },
    },
  };

  const q =
  {
    bool: {
      must: [qLetter],
      filter: {
        bool: {
          must: filterQuery,
        },
      },
    },
  };
  const aggregationQuery = queryHelper.createAggregationQuery(req, q);

  search.searchEntries(q, aggregationQuery, req.query.size, req.query.offset, sortObject, req.query.mode, req.query.explain, req.query.output, res);
});

router.get("/entries/morelikethis/:entryid", function (req, res, next) {
  debug(`==> /entries/morelikethis/ [${req.params.entryid}]`);

  const sortObject = tools.getSortObject(req.query.sort);
  const filterQuery = queryHelper.createFilterQuery(req);

  if (Number.isInteger(parseInt(req.params.entryid)) && req.params.entryid.length < 8) {
    const id = ("0000000" + req.params.entryid).slice(-7);

    var q = {
      more_like_this: {
        fields: ["machineType", "genreType", "genreSubType", "contentType"],
        like: [
          {
            _index: "zxinfo_games",
            _id: id,
          },
        ],
        min_term_freq: 1,
        max_query_terms: 12,
        minimum_should_match: "80%",
      }
    };

    const aggregationQuery = queryHelper.createAggregationQuery(req, query);

    search.searchEntries(q, aggregationQuery, req.query.size, req.query.offset, sortObject, req.query.mode, req.query.explain, req.query.output, res);
  } else {
    res.status(404).end();
  }
});
/**
    search.powerSearch(query, aggregationQuery, req.query.size, req.query.offset, sortObject, req.query.mode).then(function (result) {
      debug(`########### RESPONSE from powerSearch(${req.params.query},${req.query.size}, ${req.query.offset}, ${req.query.mode})`);
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
    },
      function (reason) {
        debug(`[FAILED] reason: ${reason.message}`);
        if (reason.message === "Not Found") {
          res.status(404).end();
        } else {
          res.status(500).end();
        }
      });
  } else {
    res.status(400).end();
  }
   
});*/


router.get("/entries/byauthor/:name", function (req, res, next) {
  debug(`==> /entries/byauthor/ [${req.params.name}]`);

  const sortObject = tools.getSortObject(req.query.sort);
  const filterQuery = queryHelper.createFilterQuery(req);

  const q = {
    bool: {
      should: [
        {
          nested: {
            path: "authors",
            query: {
              bool: {
                must: [
                  {
                    match_phrase_prefix: {
                      "authors.name": req.params.name,
                    },
                  },
                ],
              },
            },
          },
        },
        {
          nested: {
            path: "authors",
            query: {
              bool: {
                must: [
                  {
                    match_phrase_prefix: {
                      "authors.groupName": req.params.name,
                    },
                  },
                ],
              },
            },
          },
        },
      ],
      minimum_should_match: 1,
    },
  };

  const query = {
    bool: {
      must: q,
      filter: {
        bool: {
          must: filterQuery,
        },
      },
    },
  };
  const aggregationQuery = queryHelper.createAggregationQuery(req, q);

  search.searchEntries(query, aggregationQuery, req.query.size, req.query.offset, sortObject, req.query.mode, req.query.explain, req.query.output, res);
});

/************************************************
 *
 * requests served by this endpoint
 *
 ************************************************/
router.get("/entries/bypublisher/:name", function (req, res, next) {
  debug(`==> /entries/bypublisher/ [${req.params.name}]`);

  const sortObject = tools.getSortObject(req.query.sort);
  const filterQuery = queryHelper.createFilterQuery(req);

  const q = {
    bool: {
      should: [
        {
          nested: {
            path: "publishers",
            query: {
              bool: {
                must: [
                  {
                    match_phrase_prefix: {
                      "publishers.name": req.params.name,
                    },
                  },
                ],
              },
            },
          },
        },
        {
          nested: {
            path: "releases",
            query: {
              nested: {
                path: "releases.publishers",
                query: {
                  bool: {
                    must: [
                      {
                        match_phrase_prefix: {
                          "releases.publishers.name": req.params.name,
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
    },
  };

  const query = {
    bool: {
      must: q,
      filter: {
        bool: {
          must: filterQuery,
        },
      },
    },
  };

  const aggregationQuery = queryHelper.createAggregationQuery(req, q);

  search.searchEntries(query, aggregationQuery, req.query.size, req.query.offset, sortObject, req.query.mode, req.query.explain, req.query.output, res);
});

function getRandomX(total, outputmode) {
  debug("getRandomX()");

  if (outputmode !== "full" && outputmode !== "compact") {
    outputmode = "tiny";
  }
  return elasticClient.search({
    _source: tools.es_source_item(outputmode),
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    body:
    //-- BODY
    {
      size: total,
      query: {
        function_score: {
          query: {
            bool: {
              must_not: [],
              must: [
                {
                  terms: { genreType: ["Adventure Game", "Arcade Game", "Casual Game", "Game", "Sport Game", "Strategy Game"] },
                },
                {
                  match: {
                    contentType: "SOFTWARE",
                  },
                },
              ],
              should: [
                {
                  nested: {
                    path: "screens",
                    query: {
                      bool: {
                        must: [
                          {
                            match: {
                              "screens.type": "Loading screen",
                            },
                          },
                          {
                            match: {
                              "screens.format": "Picture",
                            },
                          },
                        ],
                      },
                    },
                  },
                },
                {
                  nested: {
                    path: "screens",
                    query: {
                      bool: {
                        must: [
                          {
                            match: {
                              "screens.type": "Running screen",
                            },
                          },
                          {
                            match: {
                              "screens.format": "Picture",
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
          functions: [
            {
              random_score: { seed: "" + Date.now(), field: "_seq_no" },
            },
          ],
        },
      },
    },
  });
};

router.get("/entries/random/:total", function (req, res, next) {
  debug("==> /entries/random/:total");
  debug(`total: ${req.params.total}, mode: ${req.query.mode}`);

  getRandomX(req.params.total, req.query.mode).then(function (result) {
    debug(`########### RESPONSE from getRandomX(${req.params.total}, mode: ${req.query.mode})`);
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
  });
});

module.exports = router;
