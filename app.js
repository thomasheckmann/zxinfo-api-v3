var express = require("express");

var path = require("path");
var cors = require("cors");

var app = express();
app.use(cors());

var appConfig = require("./config.json");

/* ROUTES */
var games = require("./routes/games");
var suggest = require("./routes/suggest");
var search = require("./routes/search");
var metadata = require("./routes/metadata");
var authors = require("./routes/authors");
var publishers = require("./routes/publishers");
var social = require("./routes/social");
var zx81scr = require("./routes/zx81scr");

if (process.env.NODE_ENV === undefined) {
  console.log("NODE_ENV not defined, must be 'development' or 'production'");
  process.exit(0);
}

console.log("# APP START ###################################################");
console.log("# RUNNING in mode: " + process.env.NODE_ENV);
console.log("# nodeJS version: " + process.version);
console.log("#");
console.log("# CONFIG DUMP #################################################");
console.log(JSON.stringify(appConfig[process.env.NODE_ENV], null, 2));
console.log("###############################################################");
console.log("#");

app.use(express.static(path.join(__dirname, "public")));

// ROUTES
app.use("/v3/games/", games);
app.use("/v3/suggest/", suggest);
app.use("/v3/search/", search);
app.use("/v3/metadata/", metadata);
app.use("/v3/authors/", authors);
app.use("/v3/publishers/", publishers);
app.use("/social/", social);
app.use("/v3/scr/", zx81scr);

app.get("/", (req, res) => {
  console.log("[CATCH ALL]");
  console.log(req.path);
  res.send("Hello World!");
});

module.exports = app;
