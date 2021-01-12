var express = require("express");
var app = express();
var appConfig = require("./config.json");

/* ROUTES */
var games = require("./routes/games");

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

app.use("/v3/games/", games);

app.get("/", (req, res) => {
  console.log("[CATCH ALL]");
  console.log(req.path);
  res.send("Hello World!");
});

module.exports = app;
