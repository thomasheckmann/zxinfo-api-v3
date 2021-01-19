var express = require("express");
var app = express();

var path = require("path");

var appConfig = require("./config.json");

/* ROUTES */
var games = require("./routes/games");
var suggest = require("./routes/suggest");
var search = require("./routes/search");

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

app.get("/", (req, res) => {
  console.log("[CATCH ALL]");
  console.log(req.path);
  res.send("Hello World!");
});

module.exports = app;
