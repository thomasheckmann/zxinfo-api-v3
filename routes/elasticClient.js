"use strict";
const elasticsearch = require("elasticsearch");
var config = require("../config.json")[process.env.NODE_ENV || "development"];

var elasticClient = new elasticsearch.Client({
  host: config.es_host,
  apiVersion: config.es_apiVersion,
  httpAuth: 'elastic:mju76YHNES',
  log: config.es_log,
});
exports.elasticClient = elasticClient;
var es_index = config.zxinfo_index;
exports.es_index = es_index;
