/**
 * NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:social* nodemon --ignorpublic/javascripts/config.js --exec npm start
 *
 * https://developers.facebook.com/tools/debug/
 * https://developers.facebook.com/tools/debug/echo/?q=http%3A%2F%2Fdev.zxinfo.dk%2Fdetails%2F0002259
 * https://developers.facebook.com/docs/sharing/webmasters/
 */

"use strict";

const moduleId = "social";

var config = require("../config.json")[process.env.NODE_ENV || "development"];
var express = require("express");
var router = express.Router();

var debug = require("debug")(`zxinfo-api-v3:${moduleId}`);

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

function getHTML(title, title_long, description, url, img_url, img_width, img_height, img_type) {
  var html = `<html><head><title>${title}</title>`;
  html += `<meta property="og:url" content="${url}" />`;
  html += `<meta property="og:type" content="website" />`;
  html += `<meta property="og:title" content="${title_long}" />`;
  html += `<meta property="og:description" content="${description}" />`;
  html += `<meta property="og:image" content="${img_url}" />`;
  html += `<meta property="og:image:width" content="${img_width}">`;
  html += `<meta property="og:image:height" content="${img_height}">`;
  html += `<meta property="og:image:type" content="${img_type}" />`;
  html += `</head><body>`;
  html += `<h1>${title_long}</h1>`;
  html += `<h2>${description}</h2>`;
  html += `<br/><img src="${img_url}"></img><br/>${img_url}<br/>`;
  html += `<div>`;
  html += `</div>`;
  html += `</body></html >`;
  html += ``;

  return html;
}

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
  var loadscreen = "/images/placeholder.png";
  if (source.genreType == "Compilation") {
    loadscreen = "https://zxinfo.dk/media/images/compilation.png";

    /** Try to find Inlay for compilation - in additionals */
    var i = 0;
    var inlays = [];
    for (; source.additionalDownloads !== undefined && i < source.additionalDownloads.length; i++) {
      var item = source.additionalDownloads[i];
      if (item.type.indexOf("inlay") != -1 && item.format.startsWith("Picture")) {
        /** Ignore 'Back' */
        if (item.path.indexOf("Back") == -1) {
          inlays.push(item);
        }
      }
    }
    if (inlays.length > 0) {
      loadscreen = inlays[0].path.replace("/pub/sinclair/", "/thumbs/");
    } else if (source.screens.length) {
      loadscreen = source.screens[0].url;
    } else {
      /* no inlay found, and no running screens */
      loadscreen = "/images/compilation.png";
    }
  }

  if (source.screens.length && source.screens[0].url && source.genreType !== "Compilation") {
    loadscreen = source.screens[0].url;
    loadscreen = loadscreen.replace("/pub/sinclair/books-pics", "/thumbs/books-pics");
    loadscreen = "https://zxinfo.dk/media" + loadscreen;
  } else {
    loadscreen = "https://zxinfo.dk/media" + loadscreen;
  }

  return loadscreen;
}

/************************************************
 *
 * common to use for all requests
 *
 ************************************************/
router.use(function (req, res, next) {
  debug(`[social.js] got request - start processing, path: ${req.path}`);
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

//TODO: handle id without trailing 0s
router.get("/details/:gameid", (req, res) => {
  debug(`social.js /details:gameid - ${req.params.gameid}]`);
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
      if (result._source.machineType === null) {
        og_description =
          result._source.genreType + " - " + result._source.publishers[0].name + "(" + result._source.originalYearOfRelease + ")";
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
      // function getHTML(title, title_long, description, url, img_url, img_width, img_height, img_type) {
      var html = getHTML(
        og_title,
        "ZXInfo - The open source ZXDB frontend",
        og_description,
        `https://zxinfo.dk/details/${req.params.gameid}`,
        og_image,
        "320",
        "200",
        og_image_type
      );

      res.send(html);
    });
  } else {
    res.status(404).end();
  }
});

router.get("/*", (req, res) => {
  // function getHTML(title, title_long, description, url, img_url, img_width, img_height, img_type) {

  var html = getHTML(
    "ZXInfo",
    "ZXInfo - The open source ZXDB frontend",
    "Provides a fantastic desktop and mobile friendly interface to search and browse the ZXDB catalogue for almost all Spectrum software, hardware and books ever released.",
    "https://zxinfo.dk/",
    "https://zxinfo.dk/media/icons/android-chrome-512x512.png",
    "512",
    "512",
    "image/png"
  );

  res.send(html);
});

module.exports = router;
