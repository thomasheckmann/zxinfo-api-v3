/**
 * Lookup entry by md5 (32) or sha512 (128) hash
 *
 * http://localhost:8300/v3/filecheck/82bb33587530d337323ef3cd4456d4c4
 * or
 * http://localhost:8300/v3/filecheck/d4792184f2e471c4cc38e6f1f234ab4276c537224d2ca2f19f0b36695afc9a03ac4fb5dd4afdf549384725a91901221de825867627fac019ef0f5e033561f3a4
 *
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

var hashLookup = function (hash) {
  debug(`md5lookup() : ${hash}`);

  return elasticClient.search({
    _sourceIncludes: ["_id", "title", "zxinfoVersion", "contentType", "originalYearOfRelease", "machineType", "genre", "genreType", "genreSubType", "publishers.name", "md5hash"],
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    index: es_index,
    body: {
      query: {
        multi_match: {
          query: hash,
          fields: ["md5hash.md5", "md5hash.sha512"],
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

  if (req.params.hash.length !== 32 && req.params.hash.length !== 128) {
    debug(`NOT a hash (length = 32 or 128)`);
    res.status(500).end();
    return;
  }
  hashLookup(req.params.hash).then(
    function (result) {
      debug(`########### RESPONSE from hashLookup(${req.params.hash})`);
      debug(result);
      debug(`#############################################################`);
      res.header("X-Total-Count", result.hits.total.value);

      if (result.hits.total.value === 0) {
        res.status(404).end();
      } else {
        const md5hash = result.hits.hits[0]._source.md5hash;
        // const sha512 = result.hits.hits[0]._source.sha512;

        var entry = {};
        entry.entry_id = result.hits.hits[0]._id;
        entry.title = result.hits.hits[0]._source.title;
        entry.zxinfoVersion = result.hits.hits[0]._source.zxinfoVersion;
        entry.contentType = result.hits.hits[0]._source.contentType;
        entry.originalYearOfRelease = result.hits.hits[0]._source.originalYearOfRelease;
        entry.machineType = result.hits.hits[0]._source.machineType;
        entry.genre = result.hits.hits[0]._source.genre;
        entry.genreType = result.hits.hits[0]._source.genreType;
        entry.genreSubType = result.hits.hits[0]._source.genreSubType;
        entry.publishers = result.hits.hits[0]._source.publishers;
        console.log(result.hits.hits);
        var picked;

        // 82055e3fcd911c98dd3193ae3fa486cf530cfdad154523ce17c73fe54a9d1c6c9c0c55f506aa0daaf7cb7b07c3169a44ff92fbaffe078686e1ccddaa215f198b
        // Exists in two different sources with different filenames
        if (req.params.hash.length == 32) picked = md5hash.filter((o) => o.md5 === req.params.hash);
        if (req.params.hash.length == 128) picked = md5hash.filter((o) => o.sha512 === req.params.hash);

        console.log(picked);
        entry.file= picked;
        res.send(entry);
        // res.send({ entry_id: entry_id, title: title, file: picked });
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
