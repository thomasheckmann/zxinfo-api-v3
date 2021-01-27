"use strict";

var config = require("../config.json")[process.env.NODE_ENV || "development"];
var express = require("express");
var router = express.Router();

var debug = require("debug")("zxinfo-api-v3:games");

var tools = require("./utils");

var elasticsearch = require("elasticsearch");
var elasticClient = new elasticsearch.Client({
  host: config.es_host,
  apiVersion: config.es_apiVersion,
  log: config.es_log,
});

var es_index = config.zxinfo_index;

/**
 * Test case:
 *      - pick game from frontpage (or result page)
 *      - direct link to detail page '/details/0002259'
 *
 * Notes:
 *      - TODO: Invalid ID is not handled in any way
 */
var getGameById = function (gameid, outputmode) {
  debug(`getGameById() : ${gameid}, outputmode: ${outputmode}`);

  return elasticClient.get({
    _source: tools.es_source_item(outputmode),
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    index: es_index,
    id: gameid,
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
    Return game with :gameid
*/
router.get("/:gameid", function (req, res, next) {
  debug("==> /games/:gameid");
  debug(
    `gameid: ${req.params.gameid}, len: ${req.params.gameid.length}, isInt: ${Number.isInteger(parseInt(req.params.gameid))}`
  );

  if (Number.isInteger(parseInt(req.params.gameid)) && req.params.gameid.length < 8) {
    const id = ("0000000" + req.params.gameid).slice(-7);
    getGameById(id, req.query.mode).then(
      function (result) {
        //res.send(tools.renderMagazineLinks(result));
        if (req.query.mode === "titleonly") {
          res.send(result._source.title);
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
