"use strict";

var config = require("../config.json")[process.env.NODE_ENV || "development"];
var express = require("express");
var router = express.Router();

var debug = require("debug")("zxinfo-api-v4");

const search = require("./search/search");
const metadata = require("./metadata/metadata");
const filecheck = require("./filecheck/filecheck");
const suggest = require("./suggest/suggest");
const entries = require("./entries/entries");
const magazines = require("./magazines/magazines");

/************************************************
 *
 * common to use for all requests
 *
 ************************************************/
router.use(function (req, res, next) {
    debug(`API v4 got request - start processing, path: ${req.path}`);
    debug(`user-agent: ${req.headers["user-agent"]}`);
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    // do logging
    next(); // make sure we go to the next routes and don't stop here
});

router.get("/search*", search);

router.get("/metadata*", metadata);

router.get("/filecheck*", filecheck);

router.get("/suggest*", suggest);

router.get("/entries*", entries);

router.get("/magazines*", magazines);

router.get("*", (req, res) => {
    debug("[CATCH ALL]");
    res.send("Hello World! api-v4 catch all - read more about this API here <link>: " + req.path);
});

module.exports = router;
