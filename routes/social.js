/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:moduleId* nodemon --ignorpublic/javascripts/config.js --exec npm start
 *
 * https://developers.facebook.com/tools/debug/
 * https://developers.facebook.com/tools/debug/echo/?q=http%3A%2F%2Fdev.zxinfo.dk%2Fdetails%2F0002259
 * https://developers.facebook.com/docs/sharing/webmasters/
 */

"use strict";

const moduleId = "moduleId";

var config = require("../config.json")[process.env.NODE_ENV || "development"];
var express = require("express");
var router = express.Router();

var debug = require("debug")(`zxinfo-api-v3:social`); // TODO: Change debug identifier

var tools = require("./utils");

var elasticsearch = require("elasticsearch");
var elasticClient = new elasticsearch.Client({
  host: config.es_host,
  apiVersion: config.es_apiVersion,
  log: config.es_log,
});

var es_index = config.zxinfo_index;

const media_url = "https://zxinfo.dk/media";
const books_url = "https://archive.zx-spectrum.org.uk/WoS";
const hw_url = "https://archive.zx-spectrum.org.uk";

var getGameById = function (gameid) {
  debug(`getGameById() : ${gameid}`);

  return elasticClient.get({
    _source: tools.es_source_item("tiny"),
    _sourceExcludes: ["titlesuggest", "publishersuggest", "authorsuggest", "metadata_author", "metadata_publisher"],
    index: es_index,
    id: gameid,
  });
};

function loadscreen(source) {
  // iterate all additionals to find loading screen, if any

  var loadscreen = null;
  if (source.genreType == "Compilation") {
    loadscreen = "/images/compilation.png";
  } else if (source.screens.length) {
    var idx = 0;
    var screen = null;
    for (; loadscreen == null && idx < source.screens.length; idx++) {
      if ("Loading screen" == source.screens[idx].type && "Picture" == source.screens[idx].format) {
        loadscreen = source.screens[idx].url;
      }
    }
  }

  if (loadscreen == null) {
    loadscreen = media_url + "/images/empty.png";
  } else if (source.contenttype == "BOOK") {
    loadscreen = books_url + loadscreen;
  } else if (source.contenttype == "HARDWARE") {
    loadscreen = hw_url + loadscreen;
  } else {
    loadscreen = media_url + loadscreen;
  }

  return loadscreen;
}

/************************************************
 *
 * common to use for all requests
 *
 ************************************************/
router.use(function (req, res, next) {
  console.log(`[social.js] got request - start processing, path: ${req.path}`);
  console.log(`user-agent: ${req.headers["user-agent"]}`);
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

//TODO: handle id without trailing 0s
router.get("/details/:gameid", (req, res) => {
  console.log(`social.js /details:gameid - ${req.params.gameid}]`);
  if (Number.isInteger(parseInt(req.params.gameid)) && req.params.gameid.length < 8) {
    const id = ("0000000" + req.params.gameid).slice(-7);

    getGameById(id).then(function (result) {
      var og_url = "https://zxinfo.dk/details/" + req.params.gameid;
      var og_title = result._source.title;
      var og_image = loadscreen(result._source);
      var og_image_type = "image/jpeg";
      if (og_image.endsWith("png")) {
        og_image_type = "image/png";
      } else if (og_image.endsWith("gif")) {
        og_image_type = "image/gif";
      }

      var og_description;
      if (result._source.machinetype === null) {
        og_description =
          result._source.type + " - " + result._source.releases[0].publisher + "(" + result._source.yearofrelease + ")";
      } else {
        og_description =
          result._source.machineType +
          ", " +
          result._source.genre +
          " - " +
          result._source.publishers[0].name +
          "(" +
          result._source.originalYearOfRelease +
          ")";
      }
      // og_image = "https://ebimg.dk/ux/data/social/eblogo_1024.png";
      var html = `<html><head><title>${og_title} | ZXInfo</title>`;
      html += `<meta property="og:url" content="https://zxinfo.dk/details/${req.params.gameid}" />`;
      html += `<meta property="og:type" content="article" />`;
      html += `<meta property="og:title" content="${og_title}" />`;
      html += `<meta property="og:description" content="${og_description}" />`;
      html += `<meta property="og:image" content="${og_image}" />`;
      //html += `<meta property="og:image:width" content="250">`;
      //html += `<meta property="og:image:height" content="221">`;
      html += `<meta property="og:image:type" content="${og_image_type}" />`;
      html += `</head><body>`;
      html += `<h1>${og_title}</h1>`;
      html += `<h2>${og_description}</h2>`;
      html += `${og_image_type}<br/><img src="${og_image}"></img><br/>${og_image}<br/>`;
      html += `<div>`;
      // html += JSON.stringify(result._source, null, 4);
      html += `</div>`;
      html += `</body ></html >`;
      html += ``;

      res.send(html);
    });
  } else {
    res.status(404).end();
  }
});

router.get("/*", (req, res) => {
  console.log(req);
  res.send(`Hello, World - social! ${req.path}`);
});

module.exports = router;
