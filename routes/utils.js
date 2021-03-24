"use strict";

var debug = require("debug")("zxinfo-api-v3:utils");
var flatten = require("flat");

const default_mode = "compact";
const default_size = 25;
const default_offset = 0;
const default_sort = "rel_desc";

/**
 * sets default values, if they does not exists
 *
 * - mode
 * - size
 * - offset
 * - sort
 *
 */
var setDefaultValuesModeSizeOffsetSort = function (q) {
  debug(`setDefaultValuesModeSizeOffsetSort`);
  if (!q.mode) {
    debug(`setting mode=${default_mode}`);
    q.mode = default_mode;
  }
  if (!q.size) {
    debug(`setting size=${default_size}`);
    q.size = default_size;
  }
  if (!q.offset) {
    debug(`setting offset=${default_offset}`);
    q.offset = default_offset;
  }
  if (!q.sort) {
    debug(`setting sort=${default_sort}`);
    q.sort = default_sort;
  }
  return q;
};

var setDefaultValueMode = function (q) {
  debug(`setDefaultValueMode`);
  if (!q.mode) {
    debug(`setting mode=${default_mode}`);
    q.mode = default_mode;
  }
  return q;
};

/*	
	Builds ES object for sorting, based on sort_mode.
	sort_mode:
		* title_asc or title_desc (sort by title)
		* date_asc or date_desc   (sort by release date)
		* rel_asc or rel_desc     (sort by relevance score)
*/
var getSortObject = function (sort_mode) {
  var sort_object;

  if (sort_mode === "title_asc") {
    sort_object = [
      {
        "title.keyword": {
          order: "asc",
        },
      },
    ];
  } else if (sort_mode === "title_desc") {
    sort_object = [
      {
        "title.keyword": {
          order: "desc",
        },
      },
    ];
  } else if (sort_mode === "date_asc") {
    sort_object = [
      {
        originalYearOfRelease: {
          order: "asc",
        },
      },
      {
        originalMonthOfRelease: {
          order: "asc",
        },
      },
      {
        originalDayOfRelease: {
          order: "asc",
        },
      },
    ];
  } else if (sort_mode === "date_desc") {
    sort_object = [
      {
        originalYearOfRelease: {
          order: "desc",
        },
      },
      {
        originalMonthOfRelease: {
          order: "desc",
        },
      },
      {
        originalDayOfRelease: {
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
    ];
  } else if (sort_mode === "rel_desc") {
    sort_object = [
      {
        _score: {
          order: "desc",
        },
      },
      {
        "title.keyword": {
          order: "asc",
        },
      },
    ];
  }
  return sort_object;
};

/**
 * returns fields according to output mode for single item
 * @param {*} outputmode
 */
var es_source_item = function (outputmode) {
  debug(`es_source_item() : outputmode: ${outputmode}`);
  if (outputmode == "full") {
    /* full output */
    return ["*"];
  } else if (outputmode == "compact") {
    /* compact output */
    var source_includes = [
      "title",
      "contentType",
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
      "additionalDownloads",
      "screens",
    ];
    return source_includes;
  } else if (outputmode == "tiny") {
    return [
      "title",
      "contentType",
      "originalYearOfRelease",
      "machineType",
      "genre",
      "genreType",
      "genreSubType",
      "isbn",
      "score",
      "publishers.publisherSeq",
      "publishers.name",
      "publishers.country",
      "additionalDownloads",
      "screens",
    ];
  }
};

/**
 * returns fields according to output mode for search results
 * @param {
 * } outputmode
 */
var es_source_list = function (outputmode) {
  debug(`es_source_list() : outputmode: ${outputmode}`);
  if (outputmode == "full") {
    /* full output */
    return ["*"];
  } else if (outputmode == "compact") {
    /* compact output */
    var source_includes = [
      "title",
      "contentType",
      "originalYearOfRelease",
      "originalMonthOfRelease",
      "originalDayOfRelease",
      "machineType",
      "score",
      "isbn",
      "genre",
      "genreType",
      "genreSubType",
      "availability",
      "authors",
      "publishers",
      "releases.publishers",
      "additionalDownloads",
      "screens",
    ];
    return source_includes;
  } else if (outputmode == "tiny") {
    return [
      "title",
      "contentType",
      "originalYearOfRelease",
      "machineType",
      "score",
      "isbn",
      "genre",
      "genreType",
      "genreSubType",
      "availability",
      "publishers.publisherSeq",
      "publishers.name",
      "publishers.country",
      "additionalDownloads",
      "screens",
    ];
  } else if (outputmode == "simple") {
    return ["title"];
  }
};

/**
 *
 * simple output format: {id. title}
 *
 */
var renderSimpleOutput = function (r) {
  debug(`renderSimpleOutput() :`);
  debug(r);

  var result = [];
  for (var i = 0; r.hits.hits && i < r.hits.hits.length; i++) {
    const item = r.hits.hits[i];
    result.push({ id: item._id, title: item._source.title });
  }
  return result;
};

/**
 *
 * flat output format: key=value
 *
 */
var renderFlatOutputEntries = function (r) {
  debug(`renderFlatOutputEntries() :`);
  debug(r);

  const data = flatten(r);
  debug(`renderFlatOutputEntries()`);
  debug(data);
  var result = "";
  for (let [key, value] of Object.entries(data)) {
    if (key.startsWith("hits.")) {
      result += key.replace("hits.", "").replace("_source.", "") + "=" + value + "\n";
      debug(`${key}: ${value}`);
    }
  }
  return result;
};

var renderFlatOutputEntry = function (r) {
  debug(`renderFlatOutputEntries() :`);
  debug(r);

  const data = flatten(r);
  debug(`renderFlatOutputEntries()`);
  debug(data);
  var result = "";
  for (let [key, value] of Object.entries(data)) {
    if (key.startsWith("_source.")) {
      result += key.replace("_source.", "") + "=" + value + "\n";
    }
  }
  return result;
};

/** TODO: one section, not 3 - simplify */
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
  renderSimpleOutput: renderSimpleOutput,
  renderFlatOutputEntries: renderFlatOutputEntries,
  renderFlatOutputEntry: renderFlatOutputEntry,
  getSortObject: getSortObject,
  renderMagazineLinks: renderMagazineLinks,
  setDefaultValuesModeSizeOffsetSort: setDefaultValuesModeSizeOffsetSort,
  setDefaultValueMode: setDefaultValueMode,
};
