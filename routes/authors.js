/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:authors* nodemon --ignorpublic/javascripts/config.js --exec npm start
 */

"use strict";

const moduleId = "authors";

var config = require("../config.json")[process.env.NODE_ENV || "development"];
var express = require("express");
var router = express.Router();

var debug = require("debug")(`zxinfo-api-v3:${moduleId}`);

var tools = require("./utils");

var elasticsearch = require("elasticsearch");
var elasticClient = new elasticsearch.Client({
  host: config.es_host,
  apiVersion: config.es_apiVersion,
  log: config.es_log,
});

var es_index = config.zxinfo_index;

var getGamesByAuthor = function (name, page_size, offset, outputmode, sort) {
  debug(`getGamesByAuthor(name: ${name}), sort: ${sort}, mode: ${outputmode}, size: ${page_size}, offset=${offset}`);

  var sort_object = tools.getSortObject(sort);

  return elasticClient.search({
    _source: tools.es_source_list(outputmode),
    _source_excludes: "titlesuggest, publishersuggest, authorsuggest, metadata_author, metadata_publisher",
    filter_path: "-hits.hits.sort,-hits.hits.highlight,-hits.hits._explanation",
    index: es_index,
    body: {
      size: page_size,
      from: offset * page_size,
      query: {
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
                          "authors.name": name,
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
                          "authors.groupName": name,
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
      sort: sort_object,
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
router.get("/:name/games", function (req, res, next) {
  debug("==> /authors/:name/games");

  if (!req.query.sort) {
    req.query.sort = "date_asc";
  }
  // set default values for mode, size & offset
  req.query = tools.setDefaultValuesModeSizeOffsetSort(req.query);

  //   powerSearch(req.query, req.query.size, req.query.offset, req.query.mode).then(function (result) {

  getGamesByAuthor(req.params.name, req.query.size, req.query.offset, req.query.mode, req.query.sort).then(function (result) {
    debug(
      `########### RESPONSE from getGamesByAuthor(${req.params.name},${req.query.size}, ${req.query.offset}, ${req.query.mode}, ${req.query.sort})`
    );
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

router.get("/", (req, res) => {
  console.log(`[CATCH ALL - ${moduleId}]`);
  console.log(req.path);
  res.send(`Hello World from /${moduleId}`);
});

module.exports = router;
