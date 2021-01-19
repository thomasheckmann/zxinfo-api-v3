/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:metadata* nodemon --ignorpublic/javascripts/config.js --exec npm start
 */

"use strict";

const moduleId = "metadata";

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

var getMetaData = function (name) {
  debug("getMetadata()");
  return elasticClient.search({
    filter_path: "aggregations",
    index: es_index,
    body: {
      size: 0,
      aggs: {
        featuretypes: {
          nested: {
            path: "features",
          },
          aggregations: {
            filtered: {
              terms: {
                field: "features.name",
                size: 100,
                order: {
                  _key: "asc",
                },
              },
            },
          },
        },
        machinetypes: {
          terms: {
            field: "machineType",
            size: 50,
            order: {
              _key: "desc",
            },
          },
        },
        genretypes: {
          terms: {
            field: "genreType",
            size: 50,
            order: {
              _key: "asc",
            },
          },
        },
      },
    },
  });
};

/*
 * [{name: "features", group_id: "F", group_name: "Features", values: [{key: "F1", doc_count: 111}, {key: "F1", doc_count: 111}]
 *
 */
var processMetaData = function (result) {
  debug("processMetaData()");
  var metadata = {};

  // iterate machinetypes
  var machinetypes = { parameter: "machinetype", type: "S", values: [] };
  for (const machinetype in result.aggregations.machinetypes.buckets) {
    var value = result.aggregations.machinetypes.buckets[machinetype].key;
    var doc_count = result.aggregations.machinetypes.buckets[machinetype].doc_count;

    machinetypes.values.push({ value: value, doc_count: doc_count });
  }
  metadata.machinetypes = machinetypes;

  // iterate genretypes
  var genretypes = { parameter: "genretype", type: "S", values: [] };
  for (const genretype in result.aggregations.genretypes.buckets) {
    var value = result.aggregations.genretypes.buckets[genretype].key;
    var doc_count = result.aggregations.genretypes.buckets[genretype].doc_count;

    genretypes.values.push({ value: value, doc_count: doc_count });
  }
  metadata.genretypes = genretypes;

  // iterate features
  var features = { group: "F", type: "G", values: [] };
  for (const feature in result.aggregations.featuretypes.filtered.buckets) {
    var groupname = result.aggregations.featuretypes.filtered.buckets[feature].key;
    var doc_count = result.aggregations.featuretypes.filtered.buckets[feature].doc_count;

    features.values.push({ groupname: groupname, doc_count: doc_count });
  }
  metadata.features = features;
  return metadata;
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

router.get("/", function (req, res, next) {
  debug("==> /metadata");
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  getMetaData(null).then(function (result) {
    res.send(processMetaData(result));
    //res.send(result);
  });
});

router.get("/", (req, res) => {
  console.log(`[CATCH ALL - ${moduleId}]`);
  console.log(req.path);
  res.send(`Hello World from /${moduleId}`);
});

module.exports = router;
