/**
 * ZXINFO API v4 search
 * 
 */
"use strict";

const moduleId = "search";
const debug = require("debug")(`zxinfo-api-v4:${moduleId}`);

const express = require("express");
const router = express.Router();

const tools = require("../../routes/utils");
const helpers = require("../helpersRequest");
const search = require("../helpersSearch");

const queryHelper = require("./queryTerms");

/************************************************
 *
 * common to use for all requests
 *
 ************************************************/
router.use(function (req, res, next) {
    helpers.defaultRouter(moduleId, debug, req, res, next);
});

/************************************************
 *
 * requests served by this endpoint
 *
 ************************************************/

// SEARCH (empty/all)
router.get("/search", function (req, res, next) {
    debug(`==> /search [Empty/ALL}]`);

    const sortObject = tools.getSortObject(req.query.sort);
    const filterQuery = queryHelper.createFilterQuery(req);

    const query = { match_all: {} };
    const queryNegative = queryHelper.queryTermNegativeBoost();

    const q_pos =
    {
        bool: {
            must: [query],
            filter: {
                bool: {
                    must: filterQuery,
                },
            },
        },
    };

    const aggregationQuery = queryHelper.createAggregationQuery(req, q_pos);

    const q = {
        boosting: {
            positive: q_pos,
            negative: queryNegative,
            negative_boost: 0.5,
        },
    };

    search.searchEntries(q, aggregationQuery, req.query.size, req.query.offset, sortObject, req.query.mode, req.query.explain, req.query.output, res);
})

// SEACH {term}
router.get("/search/:searchterm", function (req, res, next) {
    debug(`==> /search [${req.params.searchterm}]`);

    const sortObject = tools.getSortObject(req.query.sort);
    const filterQuery = queryHelper.createFilterQuery(req);

    const query = queryHelper.queryTermDefault(req.params.searchterm, filterQuery);
    const queryNegative = queryHelper.queryTermNegativeBoost();


    const q_pos =
    {
        bool: {
            must: [query],
            filter: {
                bool: {
                    must: filterQuery,
                },
            },
        },
    };

    const aggregationQuery = queryHelper.createAggregationQuery(req, q_pos);

    const q = {
        boosting: {
            positive: q_pos,
            negative: queryNegative,
            negative_boost: 0.5,
        },
    };

    search.searchEntries(q, aggregationQuery, req.query.size, req.query.offset, sortObject, req.query.mode, req.query.explain, req.query.output, res);
});

// SEACH TITLES {term}
router.get("/search/titles/:searchterm", function (req, res, next) {
    debug(`==> /search/titles [${req.params.searchterm}]`);

    const sortObject = tools.getSortObject(req.query.sort);
    const filterQuery = queryHelper.createFilterQuery(req);

    const query = queryHelper.queryTermTitlesOnly(req.params.searchterm, filterQuery);
    const queryNegative = queryHelper.queryTermNegativeBoost();

    const aggregationQuery = queryHelper.createAggregationQuery(req, query);

    const q = {
        boosting: {
            positive: query,
            negative: queryNegative,
            negative_boost: 0.5,
        },
    };

    search.searchEntries(q, aggregationQuery, req.query.size, req.query.offset, sortObject, req.query.mode, req.query.explain, req.query.output, res);
});

// SEACH SCREENS {term}
router.get("/search/screens/:searchterm", function (req, res, next) {
    debug(`==> /search/screens [${req.params.searchterm}]`);

    const sortObject = tools.getSortObject(req.query.sort);
    const filterQuery = queryHelper.createFilterQuery(req);

    const query = queryHelper.queryTermScreenOnly(req.params.searchterm, filterQuery);

    const q = queryHelper.createAggregationQuery(req, query);

    search.searchEntries(q, aggregationQuery, req.query.size, req.query.offset, sortObject, req.query.mode, req.query.explain, req.query.output, res);
});

module.exports = router;
