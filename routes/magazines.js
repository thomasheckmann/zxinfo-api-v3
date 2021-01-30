/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:moduleId* nodemon --ignorpublic/javascripts/config.js --exec npm start
 */

"use strict";

const moduleId = "magazines";

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

var es_index = config.zxinfo_magazines_index;

var getSortObject = function (sort_mode) {
  var sort_object;
  debug(`getSortObject(${sort_mode})`);

  if (sort_mode === "name_asc") {
    sort_object = [
      {
        "name.keyword": {
          order: "asc",
        },
      },
    ];
  } else if (sort_mode === "name_desc") {
    sort_object = [
      {
        "name.keyword": {
          order: "desc",
        },
      },
    ];
  }

  debug(sort_object);
  return sort_object;
};

var getAllMagazines = function (page_size, offset, sort) {
  debug("getAllMagazines()");

  var sort_mode = sort == undefined ? "date_desc" : sort;
  var sort_object = getSortObject(sort_mode);

  return elasticClient.search({
    index: es_index,
    body: {
      size: page_size,
      from: offset * page_size,
      _source: ["name", "publisher", "language", "country"],
      query: {
        bool: {
          must: [
            {
              match_all: {},
            },
          ],
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

/**
    Return all magazines
*/
router.get("/", function (req, res, next) {
  debug("==> /magazines/");

  if (!req.query.size) req.query.size = 10;
  if (!req.query.offset) req.query.offset = 0;
  getAllMagazines(req.query.size, req.query.offset, req.query.sort).then(function (result) {
    debug(
      `########### RESPONSE from getAllMagazines(size: ${req.query.size}, offset: ${req.query.offset}, mode: ${req.query.sort})`
    );
    debug(result);
    debug(`#############################################################`);
    res.header("X-Total-Count", result.hits.total.value);
    res.send(result);
  });
});

router.get("/", (req, res) => {
  console.log(`[CATCH ALL - ${moduleId}]`);
  console.log(req.path);
  res.send(`Hello World from /${moduleId}`);
});

module.exports = router;
