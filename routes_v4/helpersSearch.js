"use strict";

const moduleId = "helperSearch";
const debug = require("debug")(`zxinfo-api-v4:${moduleId}`);
const tools = require("../routes/utils");

const config = require("../config.json")[process.env.NODE_ENV || "development"];
const es_index = config.zxinfo_index;
const elasticsearch = require("elasticsearch");
const elasticClient = new elasticsearch.Client({
    host: config.es_host,
    apiVersion: config.es_apiVersion,
    log: config.es_log,
});

function searchEntries(q, agg, page_size, offset, sortObject, outputmode, explain, output, res) {
    debug(`searchEntries()`);
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
            query: q,
            sort: sortObject,
            aggregations: agg,
        },
    }).then(function (result) {
        debug(`########### RESPONSE from elasticsearch`);
        debug(result);
        debug(`#############################################################`);

        if (explain !== undefined) {
            res.send(result);
        } else {
            res.header("X-Total-Count", result.hits.total.value);
            if (output === "simple") {
                res.send(tools.renderSimpleOutput(result));
            } else if (output === "flat") {
                res.header("content-type", "text/plain;charset=UTF-8");
                res.send(tools.renderFlatOutputEntries(result));
            } else {
                res.send(result);
            }
        }
    });
}

module.exports = {
    searchEntries: searchEntries,
}