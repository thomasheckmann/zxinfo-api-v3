"use strict";

const moduleId = "entries";
const debug = require("debug")(`zxinfo-api-v4:${moduleId}`);
const tools = require("../../routes/utils");

var express = require("express");
var router = express.Router();

const config = require("../../config.json")[process.env.NODE_ENV || "development"];
const es_index = config.zxinfo_index;
const elasticsearch = require("elasticsearch");
var elasticClient = new elasticsearch.Client({
  host: config.es_host,
  apiVersion: config.es_apiVersion,
  log: config.es_log,
});

/**
 * Test case:
 *      - pick game from frontpage (or result page)
 *      - direct link to detail page '/details/0002259'
 *
 * Notes:
 *      - TODO: Invalid ID is not handled in any way
 */
var getEntryById = function (entryid, outputmode) {
  debug(`getEntryById() : ${entryid}, outputmode: ${outputmode}`);

  return elasticClient.get({
    _source: tools.es_source_item(outputmode),
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    index: es_index,
    id: entryid,
  });
};

function moreLikeThis(entryid, page_size, outputmode) {
  debug(`moreLikeThis() : ${entryid}, outputmode: ${outputmode}`);

  return elasticClient.search({
    _sourceIncludes: tools.es_source_list(outputmode),
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    index: es_index,
    body: {
      size: page_size,
      query: {
        more_like_this: {
          fields: ["machineType", "genreType", "genreSubType", "contentType"],
          like: [
            {
              _index: "zxinfo_games",
              _id: entryid,
            },
          ],
          min_term_freq: 1,
          max_query_terms: 12,
          minimum_should_match: "80%",
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
router.use(function (req, res, next) {
  debug(`API v4 [${moduleId}] - ${req.path}`);

  next(); // make sure we go to the next routes and don't stop here
});

/************************************************
 *
 * requests served by this endpoint
 *
 ************************************************/

/**
    Return game with :gameid
*/
router.get("/entries/:entryid", function (req, res, next) {
  debug("==> /entries/:entryid");
  debug(
    `entryid: ${req.params.entryid}, len: ${req.params.entryid.length}, isInt: ${Number.isInteger(parseInt(req.params.entryid))}`
  );

  // set default values for mode
  req.query = tools.setDefaultValueMode(req.query);

  if (Number.isInteger(parseInt(req.params.entryid)) && req.params.entryid.length < 8) {
    const id = ("0000000" + req.params.entryid).slice(-7);
    getEntryById(id, req.query.mode).then(
      function (result) {
        debug(`########### RESPONSE from getEntryById(${id},${req.query.mode})`);
        debug(result);
        debug(`#############################################################`);
        //res.send(tools.renderMagazineLinks(result));
        if (req.query.output === "flat") {
          res.header("content-type", "text/plain;charset=UTF-8");
          res.send(tools.renderFlatOutputEntry(result));
        } else {
          res.send(result);
        }
      },
      function (reason) {
        debug(`[FAILED] reason: ${reason.message}`);
        if (reason.message === "Not Found") {
          res.status(404).end();
        } else {
          res.status(500).end();
        }
      }
    );
  } else {
    res.status(400).end();
  }
});

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

var getEntriesByLetter = function (letter, contenttype, machinetype, page_size, offset, outputmode, tosectype) {
  debug(`getEntriesByLetter() : ${letter}`);

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

router.get("/entries/byletter/:letter", function (req, res, next) {
  debug("==> /entries/byletter/:letter");
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
    getEntriesByLetter(
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

router.get("/entries/morelikethis/:entryid", function (req, res, next) {
  debug("==> /entries/morelikethis/:entryid");
  debug(`entryid: ${req.params.entryid}, size: ${req.query.size}, mode: ${req.query.mode}`);

  // set default values for mode
  req.query = tools.setDefaultValueMode(req.query);

  if (Number.isInteger(parseInt(req.params.entryid)) && req.params.entryid.length < 8) {
    const id = ("0000000" + req.params.entryid).slice(-7);
    moreLikeThis(id, req.query.size, req.query.mode).then(
      function (result) {
        debug(`########### RESPONSE from moreLikeThis(${id},${req.query.mode})`);
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
      },
      function (reason) {
        debug(`[FAILED] reason: ${reason.message}`);
        if (reason.message === "Not Found") {
          res.status(404).end();
        } else {
          res.status(500).end();
        }
      }
    );
  } else {
    res.status(400).end();
  }
});

function getEntriesByAuthor(name, page_size, offset, outputmode, sort) {
  debug(`getEntriesByAuthor(name: ${name}), sort: ${sort}, mode: ${outputmode}, size: ${page_size}, offset=${offset}`);

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

router.get("/entries/byauthor/:name", function (req, res, next) {
  debug("==> /entries/byauthor/:name");
  debug(`\t$${req.params.name}`);

  if (!req.query.sort) {
    req.query.sort = "date_asc";
  }
  // set default values for mode, size & offset
  req.query = tools.setDefaultValuesModeSizeOffsetSort(req.query);

  getEntriesByAuthor(req.params.name, req.query.size, req.query.offset, req.query.mode, req.query.sort).then(function (result) {
    debug(
      `########### RESPONSE from getEntriesByAuthor(${req.params.name},${req.query.size}, ${req.query.offset}, ${req.query.mode}, ${req.query.sort})`
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

function getEntriesByPublisher(name, page_size, offset, outputmode, sort) {
  debug(`getEntriesByPublisher(${name})`);

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
                path: "publishers",
                query: {
                  bool: {
                    must: [
                      {
                        match_phrase_prefix: {
                          "publishers.name": name,
                        },
                      },
                    ],
                  },
                },
              },
            },
            {
              nested: {
                path: "releases",
                query: {
                  nested: {
                    path: "releases.publishers",
                    query: {
                      bool: {
                        must: [
                          {
                            match_phrase_prefix: {
                              "releases.publishers.name": name,
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
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
 * requests served by this endpoint
 *
 ************************************************/
router.get("/entries/bypublisher/:name", function (req, res, next) {
  debug("==> /entries/bypublisher/:name");
  debug(`\t${req.params.name}`);

  if (!req.query.sort) {
    req.query.sort = "date_asc";
  }
  // set default values for mode, size & offset
  req.query = tools.setDefaultValuesModeSizeOffsetSort(req.query);

  getEntriesByPublisher(req.params.name, req.query.size, req.query.offset, req.query.mode, req.query.sort).then(function (result) {
    debug(
      `########### RESPONSE from getEntriesByPublisher(${req.params.name},${req.query.size}, ${req.query.offset}, ${req.query.mode}, ${req.query.sort})`
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

function getRandomX(total, outputmode) {
  debug("getRandomX()");

  if (outputmode !== "full" && outputmode !== "compact") {
    outputmode = "tiny";
  }
  return elasticClient.search({
    _source: tools.es_source_item(outputmode),
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    body:
    //-- BODY
    {
      size: total,
      query: {
        function_score: {
          query: {
            bool: {
              must_not: [],
              must: [
                {
                  terms: { genreType: ["Adventure Game", "Arcade Game", "Casual Game", "Game", "Sport Game", "Strategy Game"] },
                },
                {
                  match: {
                    contentType: "SOFTWARE",
                  },
                },
              ],
              should: [
                {
                  nested: {
                    path: "screens",
                    query: {
                      bool: {
                        must: [
                          {
                            match: {
                              "screens.type": "Loading screen",
                            },
                          },
                          {
                            match: {
                              "screens.format": "Picture",
                            },
                          },
                        ],
                      },
                    },
                  },
                },
                {
                  nested: {
                    path: "screens",
                    query: {
                      bool: {
                        must: [
                          {
                            match: {
                              "screens.type": "Running screen",
                            },
                          },
                          {
                            match: {
                              "screens.format": "Picture",
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
          functions: [
            {
              random_score: { seed: "" + Date.now(), field: "_seq_no" },
            },
          ],
        },
      },
    },
  });
};

router.get("/entries/random/:total", function (req, res, next) {
  debug("==> /entries/random/:total");
  debug(`total: ${req.params.total}, mode: ${req.query.mode}`);

  // set default values for mode
  req.query = tools.setDefaultValueMode(req.query);

  getRandomX(req.params.total, req.query.mode).then(function (result) {
    debug(`########### RESPONSE from getRandomX(${req.params.total}, mode: ${req.query.mode})`);
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

module.exports = router;
