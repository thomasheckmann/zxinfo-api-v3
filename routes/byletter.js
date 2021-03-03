/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:moduleId* nodemon --ignorpublic/javascripts/config.js --exec npm start
 */

"use strict";

const moduleId = "byletter";

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

// constans for machinetype
const ZXSPECTRUM = [
  "ZX-Spectrum 128 +2",
  "ZX-Spectrum 128 +2A/+3",
  "ZX-Spectrum 128 +2B",
  "ZX-Spectrum 128 +3",
  "ZX-Spectrum 128K",
  "ZX-Spectrum 128K (load in USR0 mode)",
  "ZX-Spectrum 16K",
  "ZX-Spectrum 16K/48K",
  "ZX-Spectrum 48K",
  "ZX-Spectrum 48K/128K",
];
const ZX81 = ["ZX81 64K", "ZX81 32K", "ZX81 2K", "ZX81 1K", "ZX81 16K"];
const PENTAGON = ["Scorpion", "Pentagon 128"];

var getGamesByLetter = function (letter, contenttype, machinetype, page_size, offset, outputmode, tosectype) {
  debug(`getGamesByLetter() : ${letter}`);

  var expr;
  if (letter === "#") {
    expr = "[0-9].*";
  } else {
    expr = "[" + letter.toLowerCase() + letter.toUpperCase() + "].*";
  }

  var mustArray = [
    {
      regexp: {
        "title.keyword": {
          value: expr,
          flags: "ALL",
        },
      },
    },
  ];

  if (contenttype) {
    mustArray.push({ match: { contentType: contenttype } });
  }

  if (machinetype) {
    if (!Array.isArray(machinetype)) {
      machinetype = [machinetype];
    }
    var i = 0;
    var should = [];
    for (; i < machinetype.length; i++) {
      var item = {
        match: {
          machineType: machinetype[i],
        },
      };
      should.push(item);
    }
    mustArray.push({ bool: { should: should, minimum_should_match: 1 } });
  }

  if (tosectype) {
    if (!Array.isArray(tosectype)) {
      tosectype = [tosectype];
    }
    var i = 0;
    var should = [];
    for (; i < tosectype.length; i++) {
      var item = {
        regexp: {
          "tosec.path": {
            value: `.*(${tosectype[i].toLowerCase()}|${tosectype[i].toUpperCase()})`,
            flags: "ALL",
          },
        },
      };
      should.push(item);
    }
    mustArray.push({ bool: { should: should, minimum_should_match: 1 } });
  }

  const boolObject = { must: mustArray };

  return elasticClient.search({
    _source: tools.es_source_list(outputmode),
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    index: es_index,
    body: {
      size: page_size,
      from: offset * page_size,
      query: {
        bool: boolObject,
      },
      sort: [{ "title.keyword": { order: "asc" } }],
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
    Returns a list of games starting with letter
*/
router.get("/:letter", function (req, res, next) {
  debug("==> /games/byletter/:letter");
  debug(
    `letter: ${req.params.letter}, contenttype: ${req.query.contenttype}, machinetype: ${req.query.machinetype}, mode: ${req.query.mode}, tosectype= ${req.query.tosectype}`
  );

  if (!req.query.mode || req.query.mode === "full") {
    req.query.mode = "tiny";
  }

  req.query = tools.setDefaultValuesModeSizeOffsetSort(req.query);

  if (req.query.machinetype) {
    var mTypes = [];
    if (!Array.isArray(req.query.machinetype)) {
      req.query.machinetype = [req.query.machinetype];
    }

    for (var i = 0; i < req.query.machinetype.length; i++) {
      debug(`${i} - ${req.query.machinetype[i]}`);
      switch (req.query.machinetype[i]) {
        case "ZXSPECTRUM":
          debug("- ZXSPECTRUM -");
          mTypes = mTypes.concat(ZXSPECTRUM);
          break;
        case "ZX81":
          debug("- ZX81 -");
          mTypes = mTypes.concat(ZX81);
          break;
        case "PENTAGON":
          debug("- PENTAGON -");
          mTypes = mTypes.concat(PENTAGON);
          break;
        default:
          mTypes.push(req.query.machinetype[i]);
          break;
      }
    }
    req.query.machinetype = mTypes;
    debug(`mType: ${mTypes}`);
  }

  var letter = req.params.letter.toLowerCase();
  if (letter.length !== 1) {
    res.status(400).end();
  } else {
    getGamesByLetter(
      req.params.letter,
      req.query.contenttype,
      req.query.machinetype,
      req.query.size,
      req.query.offset,
      req.query.mode,
      req.query.tosectype
    ).then(function (result) {
      debug(
        `########### RESPONSE from getGamesByLetter(${req.params.letter}, contenttype: ${req.query.contenttype}, machinetype: ${req.query.machinetype}, mode: ${req.query.mode}, tosectype = ${req.query.tosectype})`
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
  }
});

module.exports = router;
