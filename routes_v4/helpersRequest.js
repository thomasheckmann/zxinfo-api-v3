"use strict";

const tools = require("../routes/utils");

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

// constans for genretype
const GAMES = ["Adventure Game", "Arcade Game", "Casual Game", "Game", "Sport Game", "Strategy Game"];

function debugInputRequest(debug, req) {
    debug(`output ==>`);
    debug(`\tmode: ${req.query.mode}`);
    debug(`\tsize: ${req.query.size}`);
    debug(`\toffset: ${req.query.offset}`);
    debug(`\tsort: ${req.query.sort}`);

    debug(`filtering ==>`);
    debug(`\tcontenttype: ${req.query.contenttype}`);
    debug(`\tmachinetype: ${req.query.machinetype}`);
    debug(`\txrated: ${req.query.xrated}`);
    debug(`\tgenretype: ${req.query.genretype}`);
    debug(`\tgenresubtype: ${req.query.genresubtype}`);
    debug(`\tcontrol: ${req.query.control}`);
    debug(`\tmultiplayermode: ${req.query.multiplayermode}`);
    debug(`\tmultiplayertype: ${req.query.multiplayertype}`);
    debug(`\tavailability: ${req.query.availability}`);
    debug(`\tlanguage: ${req.query.language}`);
    debug(`\tyear: ${req.query.year}`);
    debug(`\tgroup: ${req.query.group}`);
    debug(`\tgroupname: ${req.query.groupname}`);
    debug(`\ttosectype: ${req.query.tosectype}`);
}

function defaultRouter(moduleId, debug, req, res, next) {
    debug(`API v4 [${moduleId}] - ${req.path}`);
    // do logging
    debugInputRequest(debug, req);

    // set default values for mode, size & offset
    req.query = tools.setDefaultValuesModeSizeOffsetSort(req.query);

    // expand machinetype
    debug(`expanding: machinetype: ${req.query.machinetype}`);
    if (req.query.machinetype) {
        var mTypes = [];
        if (!Array.isArray(req.query.machinetype)) {
            req.query.machinetype = [req.query.machinetype];
        }

        for (var i = 0; i < req.query.machinetype.length; i++) {
            debug(`\t${i} - ${req.query.machinetype[i]}`);
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

    // expand genretype
    debug(`expanding: genretype: ${req.query.genretype}`);
    if (req.query.genretype) {
        var gTypes = [];
        if (!Array.isArray(req.query.genretype)) {
            req.query.genretype = [req.query.genretype];
        }

        for (var i = 0; i < req.query.genretype.length; i++) {
            debug(`${i} - ${req.query.genretype[i]}`);
            switch (req.query.genretype[i]) {
                case "GAMES":
                    debug("- GAMES -");
                    gTypes = gTypes.concat(GAMES);
                    break;
                default:
                    gTypes.push(req.query.genretype[i]);
                    break;
            }
        }
        req.query.genretype = gTypes;
        debug(`mType: ${gTypes}`);
    }

    debug(`** READY TO SEARCH ***`);
    debugInputRequest(debug, req);

    next(); // make sure we go to the next routes and don't stop here
}

module.exports = {
    debugInputRequest: debugInputRequest,
    defaultRouter: defaultRouter,
}