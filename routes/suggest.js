/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:suggest* nodemon --ignorpublic/javascripts/config.js --exec npm start
 */

"use strict";

const moduleId = "suggest";

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

/* GET title suggestions for completion (all) */
var getSuggestions = function (query) {
  return elasticClient.search({
    index: es_index,
    body: {
      _source: ["title", "type", "contentType", "metadata_author", "metadata_publisher"],
      suggest: {
        text: query,
        titles: {
          completion: {
            field: "titlesuggest",
            skip_duplicates: true,
            size: 8,
          },
        },
        authors: {
          completion: {
            field: "authorsuggest",
            skip_duplicates: true,
            size: 8,
          },
        },
        publishers: {
          completion: {
            field: "publishersuggest",
            skip_duplicates: false,
            size: 10,
          },
        },
      },
    },
  });
};

var prepareSuggestions = function (result) {
  function uniq(a, param) {
    return a.filter(function (item, pos, array) {
      return (
        array
          .map(function (mapItem) {
            return mapItem[param];
          })
          .indexOf(item[param]) === pos
      );
    });
  }

  var suggestons = [];

  // iterate titles
  var i = 0;
  for (; i < result.suggest.titles[0].options.length; i++) {
    var item = {
      text: result.suggest.titles[0].options[i]._source.title,
      labeltype: "",
      type: result.suggest.titles[0].options[i]._source.contentType,
      entry_id: result.suggest.titles[0].options[i]._id,
    };
    suggestons.push(item);
  }

  // iterate authors
  var aut_suggestions = [];
  var j = 0;
  for (; j < result.suggest.authors[0].options.length; j++) {
    var names = result.suggest.authors[0].options[j]._source.metadata_author;
    var text = result.suggest.authors[0].options[j].text;

    var output = text;
    var t = 0;
    for (; t < names.length; t++) {
      if (names[t].alias.indexOf(text) > -1) {
        output = names[t].name;
        labeltype = names[t].labeltype == null ? "" : names[t].labeltype;
      }
    }
    var item = { text: output, labeltype: labeltype, type: "AUTHOR" };
    aut_suggestions.push(item);
  }

  var pub_suggestions = [];
  var j = 0;
  for (; j < result.suggest.publishers[0].options.length; j++) {
    var names = result.suggest.publishers[0].options[j]._source.metadata_publisher;
    var text = result.suggest.publishers[0].options[j].text;
    var name = text;
    var labeltype;
    var t = 0;

    for (; t < names.length; t++) {
      if (names[t].suggest.indexOf(text) > -1) {
        name = names[t].name;
        labeltype = names[t].labeltype == null ? "" : names[t].labeltype;
      }
    }
    var item = { text: name, labeltype: labeltype, type: "PUBLISHER" };
    pub_suggestions.push(item);
  }
  aut_suggestions = uniq(aut_suggestions, "text");
  pub_suggestions = uniq(pub_suggestions, "text");

  suggestons.push.apply(suggestons, aut_suggestions);
  suggestons.push.apply(suggestons, pub_suggestions);

  // sort
  suggestons.sort(function (a, b) {
    return a.output - b.output;
  });

  return suggestons;
};

var getAuthorSuggestions = function (name) {
  return elasticClient.search({
    index: es_index,
    body: {
      _source: ["metadata_author"], // only return this section
      suggest: {
        text: name,
        authors: {
          completion: {
            field: "authorsuggest",
            skip_duplicates: true,
            size: 10,
          },
        },
      },
    },
  });
};

var prepareAuthorSuggestions = function (result) {
  var suggestons = [];

  function uniq(a, param) {
    return a.filter(function (item, pos, array) {
      return (
        array
          .map(function (mapItem) {
            return mapItem[param];
          })
          .indexOf(item[param]) === pos
      );
    });
  }
  // iterate authors
  var suggestons = [];
  var j = 0;
  for (; j < result.suggest.authors[0].options.length; j++) {
    var names = result.suggest.authors[0].options[j]._source.metadata_author;
    var text = result.suggest.authors[0].options[j].text;
    var labeltype;

    var output = text;
    var t = 0;

    for (; t < names.length; t++) {
      if (names[t].alias.indexOf(text) > -1) {
        output = names[t].name;
        labeltype = names[t].labeltype == null ? "" : names[t].labeltype;
      }
    }
    var item = { text: output, labeltype: labeltype };
    suggestons.push(item);
  }
  // sort
  suggestons.sort(function (a, b) {
    return a.output - b.output;
  });
  suggestons = uniq(suggestons, "text");

  return suggestons;
};

var getPublisherSuggestions = function (name) {
  return elasticClient.search({
    index: es_index,
    body: {
      _source: ["metadata_publisher"], // only return this section
      suggest: {
        text: name,
        publishers: {
          completion: {
            field: "publishersuggest",
            skip_duplicates: false,
            size: 10,
          },
        },
      },
    },
  });
};

var preparePublisherSuggestions = function (result) {
  var suggestons = [];
  function uniq(a, param) {
    return a.filter(function (item, pos, array) {
      return (
        array
          .map(function (mapItem) {
            return mapItem[param];
          })
          .indexOf(item[param]) === pos
      );
    });
  }
  // iterate publishers
  var suggestons = [];
  var j = 0;
  for (; j < result.suggest.publishers[0].options.length; j++) {
    var names = result.suggest.publishers[0].options[j]._source.metadata_publisher;
    var text = result.suggest.publishers[0].options[j].text;
    var name = text;
    var labeltype;
    var t = 0;

    for (; t < names.length; t++) {
      if (names[t].suggest.indexOf(text) > -1) {
        name = names[t].name;
        labeltype = names[t].labeltype == null ? "" : names[t].labeltype;
      }
    }
    var item = { text: name, labeltype: labeltype };
    suggestons.push(item);
  }
  // sort
  suggestons.sort(function (a, b) {
    return a.output - b.output;
  });
  suggestons = uniq(suggestons, "text");

  return suggestons;
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

/* GET title suggestions for completion (all) */
router.get("/:query", function (req, res, next) {
  debug("==> /:query");
  var suggestions = null;
  getSuggestions(req.params.query).then(function (result) {
    debug(`########### RESPONSE from getSuggestions(${req.params.query})`);
    debug(result);
    debug(`#############################################################`);
    res.send(prepareSuggestions(result));
  });
});

/* GET suggestions for AUTHOR names */
router.get("/author/:name", function (req, res, next) {
  debug("==> /authors/:name");
  var suggestions = null;
  getAuthorSuggestions(req.params.name).then(function (result) {
    debug(`########### RESPONSE from getAuthorSuggestions(${req.params.name})`);
    debug(result);
    debug(`#############################################################`);
    res.send(prepareAuthorSuggestions(result));
  });
});

/* GET suggestions for PUBLISHER names */
router.get("/publisher/:name", function (req, res, next) {
  debug("==> /publisher/:name");
  var suggestions = null;
  getPublisherSuggestions(req.params.name).then(function (result) {
    debug(`########### RESPONSE from getPublisherSuggestions(${req.params.name})`);
    debug(result);
    debug(`#############################################################`);
    res.send(preparePublisherSuggestions(result));
    //res.send(result);
  });
});

router.get("/", (req, res) => {
  console.log(`[CATCH ALL - ${moduleId}]`);
  console.log(req.path);
  res.send(`Hello World from /${moduleId}`);
});

module.exports = router;
