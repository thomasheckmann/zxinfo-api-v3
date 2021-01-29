/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:moduleId* nodemon --ignorpublic/javascripts/config.js --exec npm start
 */

"use strict";

const moduleId = "byletter";

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

var getGamesByLetter = function (letter, outputmode) {
  debug(`getGamesByLetter() : ${letter}`);

  var expr;
  if (letter === "#") {
    expr = "[0-9].*";
  } else {
    expr = "[" + letter.toLowerCase() + letter.toUpperCase() + "].*";
  }

  return elasticClient.search({
    _source: tools.es_source_list(outputmode),
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    index: es_index,
    body: {
      size: 10000,
      query: {
        regexp: {
          "title.keyword": {
            value: expr,
            flags: "ALL",
          },
        },
      },
      sort: [{ "title.keyword": { order: "asc" } }],
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
    Returns a list of games starting with letter
*/
router.get("/:letter", function (req, res, next) {
  debug("==> /games/byletter/:letter");
  debug(`letter: ${req.params.letter}, mode: ${req.query.mode}`);

  if (!req.query.mode || req.query.mode === "full") {
    req.query.mode = "tiny";
  }
  var letter = req.params.letter.toLowerCase();
  if (letter.length !== 1) {
    res.status(400).end();
  } else {
    getGamesByLetter(req.params.letter, req.query.mode).then(function (result) {
      debug(`########### RESPONSE from getGamesByLetter(${req.params.letter}, mode: ${req.query.mode})`);
      debug(result);
      debug(`#############################################################`);
      res.header("X-Total-Count", result.hits.total.value);
      if (req.query.mode === "simple") {
        res.send(tools.renderSimpleOutput(result));
      } else {
        res.send(result);
      }
      /** 
		var r = [];
      for (var i = 0; i < result.hits.hits.length; i++) {
        r.push({ id: result.hits.hits[i]._id, title: result.hits.hits[i]._source.title });
      }*/
    });
  }
});

module.exports = router;
