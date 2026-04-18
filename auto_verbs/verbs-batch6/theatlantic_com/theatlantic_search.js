// Auto-generated – The Atlantic – Magazine Article Search
const { setupLLMClient, PlaywrightRecorder } = require("../../stagehand-utils");
const { genPython } = require("../../stagehand-utils");

async function theatlantic_search(page, request) {
  const query = request?.query || "artificial intelligence future society";
  // Uses Google site search: site:theatlantic.com + query
  // See Python implementation for full logic
}

module.exports = { theatlantic_search };
