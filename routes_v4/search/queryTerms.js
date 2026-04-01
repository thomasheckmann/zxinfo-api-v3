"use strict";

const moduleId = "queryTerms";

var debug = require("debug")(`zxinfo-api-v4:${moduleId}`);

function queryTermDefault(searchTerm, filterObject) {
    return {
        bool: {
            should: [
                {
                    match: {
                        titlesuggest: { query: searchTerm, boost: 10 },
                    },
                },
                {
                    term: {
                        "title.keyword": {
                            value: searchTerm,
                            case_insensitive: true,
                            boost: 8
                        }
                    }
                },
                {
                    match: {
                        title: {
                            query: searchTerm,
                            boost: 6
                        }
                    },
                },
                {
                    match_phrase: {
                        title: {
                            query: searchTerm,
                            boost: 4
                        }
                    }
                },
                {
                    wildcard: { title: "*" + searchTerm + "*" }
                },
                {
                    match_phrase: {
                        "textscan.text": {
                            query: searchTerm, boost: 6
                        },
                    }
                },
                {
                    nested: {
                        path: "releases",
                        query: {
                            bool: {
                                must: [
                                    {
                                        match_phrase_prefix: {
                                            "releases.releaseTitles": searchTerm,
                                        },
                                    },
                                ],
                            },
                        },
                        boost: 1.5,
                    },
                },
                /* releases publisers */
                {
                    nested: {
                        path: "releases.publishers",
                        query: {
                            bool: {
                                must: [
                                    {
                                        match: {
                                            "releases.publishers.name": searchTerm,
                                        },
                                    },
                                ],
                            },
                        },
                        boost: 2,
                    },
                },
                /* */
                /* publisher names */
                {
                    nested: {
                        path: "publishers",
                        query: {
                            bool: {
                                must: [
                                    {
                                        match_phrase: {
                                            "publishers.name": {
                                                query: searchTerm
                                            }
                                        }
                                    }
                                ],
                            },
                        },
                        boost: 8,
                    },
                },
                /* authors name and group */
                {
                    nested: {
                        path: "authors",
                        query: {
                            bool: {
                                should: [
                                    {
                                        match_phrase: {
                                            "authors.name": {
                                                query: searchTerm
                                            }
                                        }
                                    },
                                    {
                                        match_phrase: {
                                            "authors.groupName": {
                                                query: searchTerm
                                            }
                                        }
                                    },
                                ], minimum_should_match: 1,

                            },
                        },
                        boost: 2.5,
                    },
                },
                /* */
                /* comments */
                {
                    bool: {
                        must: [
                            {
                                match: {
                                    remarks: searchTerm,
                                },
                            },
                        ],
                        boost: 0,
                    },
                },

                /* */
            ],
        },
    };
}

function queryTermScreenOnly(searchTerm, filterObject) {
    return {
        bool: {
            must: [{
                match_phrase: {
                    "textscan.text": searchTerm
                },
            }],
            filter: filterObject
        }
    }
}

// query term for searching titles only
function queryTermTitlesOnly(searchTerm, filterObject) {
    return {
        bool: {
            should: [
                {
                    term: {
                        "title.keyword": {
                            value: searchTerm,
                            case_insensitive: true,
                            boost: 8
                        }
                    }
                },
                {
                    match: {
                        title: {
                            query: searchTerm,
                            boost: 6
                        }
                    },
                },
                {
                    match_phrase: {
                        title: {
                            query: searchTerm,
                            boost: 4
                        }
                    }
                },
                {
                    match: {
                        titlesuggest: { query: searchTerm, boost: 10 },
                    },
                },
                {
                    wildcard: { title: "*" + searchTerm + "*" }
                },
            ],
            minimum_should_match: 1,
            filter: filterObject
        },
    };
}

// query term to lower score (negative boost)
function queryTermNegativeBoost() {
    return {
        bool: {
            should: [
                {
                    exists: {
                        field: "modificationOf.title",
                    },
                },
                {
                    exists: {
                        field: "inspiredBy.title",
                    },
                },
                {
                    match: {
                        genreType: "Compilation", // boost negative if part of compilation
                    },
                },
                {
                    match: {
                        genreType: "Covertape", // boost negative if part of covertape
                    },
                },
            ]
        }
    }
}

/**
 * 
 * @param {*} filterName propertyName in JSON
 * @param {*} filterValues value to filter
 * @returns 
 */
function createFilterItem(filterName, filterValues) {
    debug(`createFilterItem(${filterName}, ${filterValues})`);
    var item_should = {};

    if (filterValues !== undefined && filterValues.length > 0) {
        if (!Array.isArray(filterValues)) {
            filterValues = [filterValues];
        }
        var i = 0;
        var should = [];
        for (; i < filterValues.length; i++) {
            var item = {
                match: {
                    [filterName]: filterValues[i],
                },
            };
            should.push(item);
        }

        item_should = { bool: { should: should, minimum_should_match: 1 } };
    }
    debug(`\t=> ${JSON.stringify(item_should)}`);
    return item_should;
};

var createFilterItemTosecType = function (filterName, filterValues) {
    debug(`createFilterItem(${filterName}, ${filterValues})`);
    var item_should = {};

    if (filterValues !== undefined && filterValues.length > 0) {
        if (!Array.isArray(filterValues)) {
            filterValues = [filterValues];
        }
        var i = 0;
        var should = [];
        for (; i < filterValues.length; i++) {
            var item = {
                regexp: {
                    "tosec.path": {
                        value: `.*(${filterValues[i].toLowerCase()}|${filterValues[i].toUpperCase()})`,
                        flags: "ALL",
                    },
                },
            };
            should.push(item);
        }

        item_should = { bool: { should: should, minimum_should_match: 1 } };
    }
    debug(JSON.stringify(item_should));
    return item_should;
};

function createFilterObjects(req) {
    var filterObjects = {}; // (name of ..), filter

    var contenttype_should = createFilterItem("contentType", req.query.contenttype);
    filterObjects["contenttype"] = contenttype_should;

    var machinetype_should = createFilterItem("machineType", req.query.machinetype);
    filterObjects["machinetypes"] = machinetype_should;

    var genretype_should = createFilterItem("genreType", req.query.genretype);
    filterObjects["genretype"] = genretype_should;

    var genresubtype_should = createFilterItem("genreSubType", req.query.genresubtype);
    filterObjects["genresubtype"] = genresubtype_should;

    var controls_should = createFilterItem("controls.control", req.query.control);
    filterObjects["controls"] = controls_should;

    var multiplayermode_should = createFilterItem("multiplayerMode", req.query.multiplayermode);
    filterObjects["multiplayermode"] = multiplayermode_should;

    var multiplayertype_should = createFilterItem("multiplayerType", req.query.multiplayertype);
    filterObjects["multiplayertype"] = multiplayertype_should;

    var xrated_should = createFilterItem("xrated", req.query.xrated);
    filterObjects["xrated"] = xrated_should;

    var availability_should = createFilterItem("availability", req.query.availability);
    filterObjects["availability"] = availability_should;

    var language_should = createFilterItem("language", req.query.language);
    filterObjects["language"] = language_should;

    var year_should = createFilterItem("originalYearOfRelease", req.query.year);
    filterObjects["yearofrelease"] = year_should;

    var tosectype_should = createFilterItemTosecType("tosectype", req.query.tosectype);
    filterObjects["tosectype"] = tosectype_should;

    var grouptype_id = "";

    if (req.query.group === "CC") {
        grouptype_id = "competition";
    } else if (req.query.group === "D") {
        grouptype_id = "demoParty";
    } else if (req.query.group === "F") {
        grouptype_id = "features";
    } else if (req.query.group === "G") {
        grouptype_id = "graphicalView";
    } else if (req.query.group === "L") {
        grouptype_id = "programmingLanguage";
    } else if (req.query.group === "M") {
        grouptype_id = "screenMovement";
    } else if (req.query.group === "P") {
        grouptype_id = "sport";
    } else if (req.query.group === "R") {
        grouptype_id = "copyright";
    } else if (req.query.group === "T") {
        grouptype_id = "themedGroup";
    } else if (req.query.group === "U") {
        grouptype_id = "unsortedGroup";
    } else if (req.query.group === "X") {
        grouptype_id = "crossPlatform";
    } else if (req.query.group === "Z") {
        grouptype_id = "featuresZX81";
    }

    /**
     * GROUPS
     */
    var groupandname_must = {};
    if (req.query.group !== undefined && req.query.groupname !== undefined) {
        var groupBools = [];
        groupBools.push({
            bool: {
                must: {
                    match: {
                        [grouptype_id + ".name"]: req.query.groupname,
                    },
                },
            },
        });
        groupandname_must = { bool: { must: groupBools } };
        filterObjects["groupandname"] = groupandname_must;
    }
    return filterObjects;
}

function createFilterQuery(req) {
    var filters = [];
    const filterObjects = createFilterObjects(req);
    var filterNames = Object.keys(filterObjects);
    for (var i = 0; i < filterNames.length; i++) {
        var item = filterObjects[filterNames[i]];
        var itemsize = Object.keys(item).length;
        if (itemsize > 0) {
            filters.push(item);
        }
    }

    return {
        "bool": {
            "must": filters
        }
    }

}

function createAggregationQuery(req, query) {
    // debug(`createAggregationQuery: ${JSON.stringify(query, null, 2)}`);
    /**
     * Helper for aggregation - each aggregation should include all filters, except its own
     */
    function removeFilter(filters, f) {
        var newFilter = [...filters];
        const index = newFilter.indexOf(f);
        if (index >= 0) {
            newFilter.splice(index, 1);
        }

        // remove empty objects
        const r = newFilter.filter((value) => Object.keys(value).length !== 0);

        return r;
    }

    function createAggObject(filterlist, filtername, fieldName) {
        var filter = removeFilter(filterlist, filterObjects[filtername]);
        var aggObject = {
            filter: {
                bool: {
                    must: filter,
                },
            },
            aggregations: {
            }
        };

        aggObject.aggregations[`filtered_${filtername}`] = {
            terms: {
                size: 100,
                field: fieldName,
                order: {
                    _key: "asc",
                },
            },
        }

        return aggObject;
    }

    const filterObjects = createFilterObjects(req);
    let aggfilter = [
        query
    ];

    var filterNames = Object.keys(filterObjects);
    for (var i = 0; i < filterNames.length; i++) {
        var item = filterObjects[filterNames[i]];
        var itemsize = Object.keys(item).length;
        if (itemsize > 0) {
            aggfilter.push(item);
        }
    }

    // debug(`Building aggregations: base=${JSON.stringify(query, null, 2)}`);
    // debug(`Building aggregations: aggfilter=${JSON.stringify(aggfilter, null, 2)}`);
    var aggObjects = {};
    // aggName, filtername, fieldname

    aggObjects["aggMachineTypes"] = createAggObject(aggfilter, "machinetypes", "machineType");
    aggObjects["aggGenreType"] = createAggObject(aggfilter, "genretype", "genreType");
    aggObjects["aggGenreSubType"] = createAggObject(aggfilter, "genresubtype", "genreSubType");
    aggObjects["aggControls"] = createAggObject(aggfilter, "controls", "controls.control");
    aggObjects["aggMultiplayerMode"] = createAggObject(aggfilter, "multiplayermode", "multiplayerMode");
    aggObjects["aggMultiplayerType"] = createAggObject(aggfilter, "multiplayertype", "multiplayerType");
    aggObjects["aggAvailability"] = createAggObject(aggfilter, "availability", "availability");
    aggObjects["aggLanguage"] = createAggObject(aggfilter, "language", "language");
    aggObjects["aggOriginalYearOfRelease"] = createAggObject(aggfilter, "yearofrelease", "originalYearOfRelease");

    return {
        all_entries: {
            global: {},
            aggregations: aggObjects
        }
    }

}

module.exports = {
    queryTermDefault: queryTermDefault,
    queryTermTitlesOnly: queryTermTitlesOnly,
    queryTermScreenOnly: queryTermScreenOnly,
    queryTermNegativeBoost: queryTermNegativeBoost,
    createFilterQuery: createFilterQuery,
    createAggregationQuery: createAggregationQuery,
}