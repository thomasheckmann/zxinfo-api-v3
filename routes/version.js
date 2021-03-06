/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:moduleId* nodemon --ignorpublic/javascripts/config.js --exec npm start
 */

"use strict";

const moduleId = "moduleId";

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

var getGameById = function (gameid) {
  debug(`getGameById() : ${gameid}`);

  return elasticClient.get({
    _source: tools.es_source_item("tiny"),
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

router.get("/", (req, res) => {
  getGameById("0002259").then(function (result) {
    const zxdbVersion = result._source.zxinfoVersion;
    res.send(zxdbVersion);
  });
});

module.exports = router;
