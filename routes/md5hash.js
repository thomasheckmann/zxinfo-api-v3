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

var md5lookup = function (md5hash) {
  debug(`md5lookup() : ${md5hash}`);

  return elasticClient.search({
    _sourceIncludes: ["_id", "title", "md5hash"],
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    index: es_index,
    body: {
      query: {
        match: {
          "md5hash.md5": {
            query: md5hash,
          },
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

router.get("/:hash", (req, res) => {
  debug("==> /filecheck:hash");
  debug(`hash: ${req.params.hash}`);

  md5lookup(req.params.hash).then(
    function (result) {
      debug(`########### RESPONSE from md5lookup(${req.params.hash})`);
      debug(result);
      debug(`#############################################################`);
      res.header("X-Total-Count", result.hits.total.value);

      if (result.hits.total.value === 0) {
        res.status(404).end();
      } else {
        const md5hash = result.hits.hits[0]._source.md5hash;
        const entry_id = result.hits.hits[0]._id;
        const title = result.hits.hits[0]._source.title;
        var picked = md5hash.find((o) => o.md5 === req.params.hash);
        res.send({ entry_id: entry_id, title: title, file: picked });
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
});

module.exports = router;
