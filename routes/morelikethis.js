/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:moduleId* nodemon --ignorpublic/javascripts/config.js --exec npm start
 */

"use strict";

const moduleId = "morelikethis";

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

var moreLikeThis = function (gameid, page_size, outputmode) {
  debug(`getGameById() : ${gameid}, outputmode: ${outputmode}`);

  return elasticClient.search({
    _sourceIncludes: tools.es_source_list(outputmode),
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    index: es_index,
    body: {
      size: page_size,
      query: {
        more_like_this: {
          fields: ["machineType", "genreType", "genreSubType", "contentType"],
          like: [
            {
              _index: "zxinfo_games",
              _id: gameid,
            },
          ],
          min_term_freq: 1,
          max_query_terms: 12,
          minimum_should_match: "80%",
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

router.get("/:gameid", function (req, res, next) {
  debug("==> /games/:gameid");
  debug(`gameid: ${req.params.gameid}, size: ${req.query.size}, mode: ${req.query.mode}`);

  // set default values for mode
  req.query = tools.setDefaultValueMode(req.query);

  if (Number.isInteger(parseInt(req.params.gameid)) && req.params.gameid.length < 8) {
    const id = ("0000000" + req.params.gameid).slice(-7);
    moreLikeThis(id, req.query.size, req.query.mode).then(
      function (result) {
        debug(`########### RESPONSE from moreLikeThis(${id},${req.query.mode})`);
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

module.exports = router;
