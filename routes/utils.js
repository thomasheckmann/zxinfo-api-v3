"use strict";

var debug = require("debug")("zxinfo-api-v3:utils");

/*
	Builds ES object for sorting, based on sort_mode.
	sort_mode:
		* title_asc or title_desc (sort by title)
		* date_asc or date_desc   (sort by release date)
		* rel_asc or rel_desc     (sort by release year)
*/
var getSortObject = function (sort_mode) {
  var sort_object;

  if (sort_mode === "title_asc") {
    sort_object = [
      {
        "fulltitle.raw": {
          order: "asc",
        },
      },
    ];
  } else if (sort_mode === "title_desc") {
    sort_object = [
      {
        "fulltitle.raw": {
          order: "desc",
        },
      },
    ];
  } else if (sort_mode === "date_asc") {
    sort_object = [
      {
        yearofrelease: {
          order: "asc",
        },
      },
      {
        monthofrelease: {
          order: "asc",
        },
      },
      {
        dayofrelease: {
          order: "asc",
        },
      },
    ];
  } else if (sort_mode === "date_desc") {
    sort_object = [
      {
        yearofrelease: {
          order: "desc",
        },
      },
      {
        monthofrelease: {
          order: "desc",
        },
      },
      {
        dayofrelease: {
          order: "desc",
        },
      },
    ];
  } else if (sort_mode === "rel_asc") {
    sort_object = [
      {
        _score: {
          order: "asc",
        },
      },
      {
        "fulltitle.raw": {
          order: "asc",
        },
      },
    ];
  } else if (sort_mode === "rel_desc") {
    sort_object = [
      {
        _score: {
          order: "desc",
        },
      },
      {
        "fulltitle.raw": {
          order: "asc",
        },
      },
    ];
  }
  return sort_object;
};

var es_source_item = function (outputmode) {
  debug(`es_source_item() : outputmode: ${outputmode}`);
  if (outputmode == "full") {
    return ["*"];
  } else if (outputmode == "tiny") {
    return [
      "title",
      "originalYearOfRelease",
      "machineType",
      "genre",
      "genreType",
      "genreSubType",
      "publishers.publisherSeq",
      "publishers.name",
      "publishers.country",
      "screens",
      "additionals",
    ];
  }

  var source_includes = [
    "title",
    "originalYearOfRelease",
    "originalMonthOfRelease",
    "originalDayOfRelease",
    "machineType",
    "numberOfPlayers",
    "multiplayerMode",
    "multiplayerType",
    "genre",
    "genreType",
    "genreSubType",
    "isbn",
    "language",
    "originalPrice",
    "availability",
    "remarks",
    "knownErrors",
    "hardwareBlurb",
    "score",
    "publishers",
    "releases",
    "authors",
    "authoredWith",
    "authoring",
    "controls",
    "series",
    "otherSystems",
    "inCompilations",
    "compilationContents",
    "inBook",
    "bookContents",
    "modificationOf",
    "modifiedBy",
    "additionals",
    "screens",
  ];
  return source_includes;
};

var es_source_list = function (outputmode) {
  debug(`es_source_list() : outputmode: ${outputmode}`);
  if (outputmode == "full") {
    return ["*"];
  }

  var source_includes = [
    "fulltitle",
    "yearofrelease",
    "monthofrelease",
    "dayofrelease",
    "type",
    "subtype",
    "authors",
    "publisher",
    "releases.publisher",
    "machinetype",
    "availability",
    "screens",
  ];

  return source_includes;
};

var renderMagazineLinks = function (r) {
  function replaceMask(input, pattern, value) {
    var result = input;
    var found = input.match(pattern);
    if (found != null) {
      var template = found[0];
      var padding = found[1];
      var zero = ("0".repeat(padding) + value).slice(-padding);
      if (padding == 1) {
        // N = 1, plain value
        zero = value;
      }
      var re = new RegExp(template, "g");
      result = input.replace(re, zero);
    }
    return result;
  }

  var magazinereviews = r._source.magazinereview;

  var i = 0;
  for (; magazinereviews !== undefined && i < magazinereviews.length; i++) {
    var link_mask = magazinereviews[i].link_mask;
    if (link_mask != null) {
      // console.log("BEFORE - ", link_mask);
      link_mask = replaceMask(link_mask, /{i(\d)+}/i, magazinereviews[i].issueno);
      link_mask = replaceMask(link_mask, /{v(\d)+}/i, magazinereviews[i].issuevolume);
      link_mask = replaceMask(link_mask, /{y(\d)+}/i, magazinereviews[i].issueyear);
      link_mask = replaceMask(link_mask, /{m(\d)+}/i, magazinereviews[i].issuemonth);
      link_mask = replaceMask(link_mask, /{d(\d)+}/i, magazinereviews[i].issueday);
      link_mask = replaceMask(link_mask, /{p(\d)+}/i, magazinereviews[i].pageno);
      magazinereviews[i].path = link_mask;
      delete magazinereviews[i].link_mask;
      // console.log("AFTER - ", link_mask);
    }
    r;
  }

  var magazineadverts = r._source.adverts;

  var i = 0;
  for (; magazineadverts !== undefined && i < magazineadverts.length; i++) {
    var link_mask = magazineadverts[i].link_mask;
    if (link_mask != null) {
      // console.log("BEFORE - ", link_mask);
      link_mask = replaceMask(link_mask, /{i(\d)+}/i, magazineadverts[i].issueno);
      link_mask = replaceMask(link_mask, /{v(\d)+}/i, magazineadverts[i].issuevolume);
      link_mask = replaceMask(link_mask, /{y(\d)+}/i, magazineadverts[i].issueyear);
      link_mask = replaceMask(link_mask, /{m(\d)+}/i, magazineadverts[i].issuemonth);
      link_mask = replaceMask(link_mask, /{d(\d)+}/i, magazineadverts[i].issueday);
      link_mask = replaceMask(link_mask, /{p(\d)+}/i, magazineadverts[i].pageno);
      magazineadverts[i].path = link_mask;
      delete magazineadverts[i].link_mask;
      // console.log("AFTER - ", link_mask);
    }
    r;
  }

  var magazinerefs = r._source.magrefs;

  var i = 0;
  for (; magazinerefs !== undefined && i < magazinerefs.length; i++) {
    var link_mask = magazinerefs[i].link_mask;
    if (link_mask != null) {
      // console.log("BEFORE - ", link_mask);
      link_mask = replaceMask(link_mask, /{i(\d)+}/i, magazinerefs[i].issueno);
      link_mask = replaceMask(link_mask, /{v(\d)+}/i, magazinerefs[i].issuevolume);
      link_mask = replaceMask(link_mask, /{y(\d)+}/i, magazinerefs[i].issueyear);
      link_mask = replaceMask(link_mask, /{m(\d)+}/i, magazinerefs[i].issuemonth);
      link_mask = replaceMask(link_mask, /{d(\d)+}/i, magazinerefs[i].issueday);
      link_mask = replaceMask(link_mask, /{p(\d)+}/i, magazinerefs[i].pageno);
      magazinerefs[i].path = link_mask;
      delete magazinerefs[i].link_mask;
      // console.log("AFTER - ", link_mask);
    }
    r;
  }

  return r;
};

module.exports = {
  es_source_item: es_source_item,
  es_source_list: es_source_list,
  getSortObject: getSortObject,
  renderMagazineLinks: renderMagazineLinks,
};
