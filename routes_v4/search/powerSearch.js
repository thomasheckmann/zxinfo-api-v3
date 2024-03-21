"use strict";

const moduleId = "powerSearch";
const debug = require("debug")(`zxinfo-api-v4:${moduleId}`);
const tools = require("../../routes/utils");

const config = require("../../config.json")[process.env.NODE_ENV || "development"];
const es_index = config.zxinfo_index;
const elasticsearch = require("elasticsearch");
const elasticClient = new elasticsearch.Client({
    host: config.es_host,
    apiVersion: config.es_apiVersion,
    log: config.es_log,
});

function powerSearch(q_pos, agg, page_size, offset, sortObject, outputmode) {
    debug(`powerSearch()`);
    debug(`\tsize: ${page_size}`);
    debug(`\toffset: ${offset}`);
    debug(`\tsort object: ${sortObject}`);

    const fromOffset = page_size * offset;
    return elasticClient.search({
        _source: tools.es_source_list(outputmode),
        _source_excludes: "titlesuggest, metadata_author,authorsuggest",
        index: es_index,
        body: {
            track_scores: true,
            size: page_size,
            from: fromOffset,
            query: q_pos,
            sort: sortObject,
            aggregations: agg,
        },
    });
}

module.exports = {
    powerSearch: powerSearch,
}