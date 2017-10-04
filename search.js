/*
 * Author: Kyle Hovey
 */

/*
 * Dependencies
 */
const qs = require("querystring");
const fs = require("fs");
const fetch = require("node-fetch");
const _ = require("lodash");

/*
 * Script config
 */
const config = {
  /* ===== Search Parameters ===== */
  searchTerm : "N-Ch",
  apiKey : require('config.json')('./config.json').apiKey,
  maxConcrruentQueries : 3,
  maxLimit : 100,
  maxResults : 1000,
  searchURL : "http://octopart.com/api/v3/parts/search?",
  includes : [ "datasheets", "specs", "category_uids" ],
  additionalParams : {
    "filter[fields][category_uids]" : "e7b12abbd6523c76", /* MOSFETs */
    sortby : "specs.breakdown_voltage_drain_to_source.value desc"
  },

  fileNames : {
    formatted : "./formatted.json",
    csv : "./output.csv"
  },

  /* ===== This is where you configure what data results you want ===== */
  dataGenerators : [
    {
      title : "Description",
      gen : part => part.snippet
    },{
      title : "Datasheet",
      gen : part => part.item.datasheets.map(ds => ds.url)[0]
    },{
      title : "URL",
      gen : part => part.item.octopart_url
    },{
      title : "Manufacturer Part Number",
      gen : part => part.item.mpn
    },{
      title : "Rds On",
      gen : part => part.item.specs.rds_drain_to_source_resistance_on.value[0]
    },{
      title : "Vdss",
      gen : part => part.item.specs.breakdown_voltage_drain_to_source.value[0]
    }
  ],

  /**
   * Determine whether or not to keep a part
   * @param {Object} part The OctoPart result
   * @return {Boolean}
   */
  keep : (part) =>
    part.item.specs.breakdown_voltage_drain_to_source !== undefined &&
    part.item.specs.breakdown_voltage_drain_to_source.value[0] !== undefined &&
    part.item.specs.rds_drain_to_source_resistance_on !== undefined &&
    part.item.specs.rds_drain_to_source_resistance_on.value[0] !== undefined
};

/**
 * Search the OctoPart database
 * @param {String} text Search text
 * @param {Number} start Start number for query
 * @param {Number} limit Number of results to query
 * @return {Promise}
 */
function search(text, start = 0, limit = 100) {
  // Generate the query string
  let queryString = qs.stringify({
    q : text,
    start : start,
    limit : limit,
    apikey : config.apiKey
  }).concat(
    [""].concat(config.includes).join("&include[]=")
  );

  // Add additional parameters
  queryString += `&${qs.stringify(config.additionalParams)}`;

  // Submit query
  return fetch(`${config.searchURL}${queryString}`).then(r => r.json());
}

/**
 * Search for as many parts as possible matching text and extract desired data
 * @param {String} text Search text
 * @param {Array} dataGeneration Array of info about desired data
 *  @param {String} dataGeneration[item].title Title of data element
 *  @param {Function} dataGeneration[item].gen Function that takes a part and
 *    returns primitive
 * @return {Promise}
 */
function findAllPossible(text) {
  return Promise.all(_
    .range(config.maxResults / config.maxLimit)
    .map(x => x * config.maxLimit)
    .map(start => search(text, start, config.maxLimit))
  )
    .then(all => all.reduce((acc, response) => acc.concat(response.results), []))
    .catch(console.log);
}

findAllPossible(config.searchTerm)
  .then(data => {
    // Filter data to remove unwanted parts
    data = data.filter(config.keep);

    // Construct formatted output data (array of arrays)
    const output = data.map(part => config.dataGenerators.map(info => {
      try {
        return info.gen(part);
      } catch (err) {
        return null;
      }
    }));

    // Save output to file
    fs.writeFile(config.fileNames.formatted, JSON.stringify(output), (err) => {
      if (err === null) {
        console.log("Formatted JSON data written");
      } else {
        console.log(err);
        throw new Error(err);
      }
    })

    // Generate CSV
    let csv = `${config.dataGenerators.map(info => info.title).join(",")}\n`;

    csv += output.reduce((whole, data) => `${whole}${data.map(
      value => value !== undefined && value !== null ? `"${value.replace(/\n/g , "")}"` : "No Data"
    ).join(",")}\n`, "");

    // Output CSV
    fs.writeFile(config.fileNames.csv, csv, (err) => {
      if (err === null) {
        console.log("CSV data written");
      } else {
        console.log(err);
        throw new Error(err);
      }
    })
  })
  .catch(console.log);
