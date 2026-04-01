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

const config = require("../config.json")[process.env.NODE_ENV || "development"];
const express = require("express");
const router = express.Router();

const debug = require("debug")(`zxinfo-api-v3:${moduleId}`); // TODO: Change debug identifier

const tools = require("./utils");

const elasticsearch = require("elasticsearch");
const elasticClient = new elasticsearch.Client({
  host: config.es_host,
  apiVersion: config.es_apiVersion,
  log: config.es_log,
});

const es_index = config.zxinfo_index;

// Hash type constants
const HASH_LENGTH = {
  MD5: 32,
  SHA512: 128,
};

const hashLookup = function (hash) {
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

router.get("/:hash", async (req, res) => {
  try {
    debug("==> /filecheck:hash");
    debug(`hash: ${req.params.hash}`);

    // Validate hash format (MD5: 32 chars or SHA512: 128 chars)
    if (req.params.hash.length !== HASH_LENGTH.MD5 && req.params.hash.length !== HASH_LENGTH.SHA512) {
      debug(`NOT a hash (length must be ${HASH_LENGTH.MD5} or ${HASH_LENGTH.SHA512})`);
      res.status(400).json({ error: "Invalid hash format" });
      return;
    }

    const result = await hashLookup(req.params.hash);
    debug(`########### RESPONSE from hashLookup(${req.params.hash})`);
    debug(result);
    debug(`#############################################################`);
    res.header("X-Total-Count", result.hits.total.value);

    if (result.hits.total.value === 0) {
      res.status(404).end();
      return;
    }

    // Destructure source data to reduce repetitive access
    const { _id, _source: source } = result.hits.hits[0];
    const { md5hash } = source;

    debug(`Found entry with ${source.md5hash?.length || 0} hash entries`);

    // Map hash type based on input length
    const hashType = req.params.hash.length === HASH_LENGTH.MD5 ? "md5" : "sha512";
    const matches = md5hash.filter((entry) => entry[hashType] === req.params.hash);

    debug(`Matched hash entries: ${matches.length}`);

    // Build response entry
    const entry = {
      entry_id: _id,
      title: source.title,
      zxinfoVersion: source.zxinfoVersion,
      contentType: source.contentType,
      originalYearOfRelease: source.originalYearOfRelease,
      machineType: source.machineType,
      genre: source.genre,
      genreType: source.genreType,
      genreSubType: source.genreSubType,
      publishers: source.publishers,
      file: matches,
    };

    res.send(entry);
  } catch (err) {
    debug(`[ERROR] ${err.message}`);
    debug(err.stack);
    if (err.message === "Not Found") {
      res.status(404).end();
    } else {
      res.status(503).json({ error: "Search service unavailable", message: err.message });
    }
  }
});

module.exports = router;
