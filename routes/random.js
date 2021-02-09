/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:random* nodemon --ignorpublic/javascripts/config.js --exec npm start
 */

"use strict";

const moduleId = "random";

var config = require("../config.json")[process.env.NODE_ENV || "development"];
var express = require("express");
var router = express.Router();

var debug = require("debug")(`zxinfo-api-v3:${moduleId}`); // TODO: Change debug identifier

var tools = require("./utils");

var elasticsearch = require("elasticsearch");
var elasticClient = new elasticsearch.Client({
  host: config.es_host,
  apiVersion: config.es_apiVersion,
  log: config.es_log,
});

var es_index = config.zxinfo_index;

var getRandomX = function (total, outputmode) {
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

/**
    Returns a list of random games
*/
router.get("/:total", function (req, res, next) {
  debug("==> /games/random/:total");
  debug(`total: ${req.params.total}, mode: ${req.query.mode}`);

  // set default values for mode
  req.query = tools.setDefaultValueMode(req.query);

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
