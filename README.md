# zxinfo-api-v4
ZXInfo v4 API - for accessing data in ZXDB

Run local in development mode, requires Elasticsearch instance running local at port 9200.
````
NODE_ENV=development PORT=8300 DEBUG=zxinfo-api-v3:* nodemon --ignorpublic/javascripts/config.js --exec 'yarn start'
````

## Changes
Major changes - renaming and grouping of endpoints, adding a few new end points to support searching. In general games has been replaced by entries, as this is the correct term used in ZXDB.

API List:
* /search/{term}
* /search/titles/{term} (new, replaces the use of "titlesonly"
* /search/screens/{term} (new, search text scanned from screen dumps)

* /entries/{entry_id} (renamed from /games)
* /entries/morelikethis/{entry_id} (renamed from /games)
* /entries/byletter/{letter} (renamed from /games)
* /entries/byauthor/{name} (replacement of v3 /authors/...)
* /entries/bypublisher/{name} (replacement of v3 /publishers/...)
* /entries/random/{count} (new, general random items)
* /entries/random/games/{count} (replacement of v3 /games/random)

* /suggest/{term}
* /suggest/titles/{term} (new)
* /suggest/author/{term}
* /suggest/publisher/{term}

* /magazines/
* /magazines/{magazine-name}
* /magazines/{magazine-name}/issues
* /magazines/{magazine-name}/issues/{issue-id}

* /metadata/
* /filecheck/{hash}

