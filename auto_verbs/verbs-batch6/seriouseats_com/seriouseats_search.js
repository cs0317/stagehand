// Auto-generated – Serious Eats – Recipe Search
const { setupLLMClient, PlaywrightRecorder } = require("../../stagehand-utils");
const { genPython } = require("../../stagehand-utils");

async function seriouseats_search(page, request) {
  const query = request?.query || "best pasta carbonara recipe";
  // Uses Google site search: site:seriouseats.com + query
  // See Python implementation for full logic
}

module.exports = { seriouseats_search };
