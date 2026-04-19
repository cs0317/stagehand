const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  search_query: "London",
  max_results: 5,
};

async function genPython(cfg, recorder) {
  const url = `https://www.parkrun.com/events/`;

  recorder.addStep(`page.goto("${url}")`);
  recorder.addStep(`page.wait_for_load_state("networkidle")`);
  recorder.addStep(`import time; time.sleep(2)`);

  // Try to search for the location
  recorder.addStep(`search_input = page.query_selector('input[type="search"], input[type="text"], #search, [class*="search"]')`);
  recorder.addStep(`if search_input:
    search_input.fill("${cfg.search_query}")
    search_input.press("Enter")
    page.wait_for_load_state("networkidle")
    time.sleep(2)`);

  recorder.addStep(`items = page.evaluate("""() => {
    const results = [];
    const rows = document.querySelectorAll('tr, [class*="event"], [class*="result"], li[class*="park"]');
    for (let i = 0; i < Math.min(rows.length, ${cfg.max_results}); i++) {
      const el = rows[i];
      if (!el.innerText.trim()) continue;
      const cells = el.querySelectorAll('td');
      const nameEl = el.querySelector('a, [class*="name"], [class*="title"]');
      const locationEl = cells.length > 1 ? cells[1] : el.querySelector('[class*="location"]');
      const countryEl = cells.length > 2 ? cells[2] : el.querySelector('[class*="country"]');
      results.push({
        event_name: nameEl ? nameEl.innerText.trim() : (cells.length > 0 ? cells[0].innerText.trim() : ''),
        location: locationEl ? locationEl.innerText.trim() : '',
        country: countryEl ? countryEl.innerText.trim() : '',
        distance: '5k',
        day_of_week: 'Saturday',
        avg_runners: ''
      });
    }
    return results.filter(r => r.event_name);
  }""")`);

  recorder.addStep(`result = {"items": items}`);
}

(async () => {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    model: "openai/gpt-4.1-mini",
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  const recorder = new PlaywrightRecorder();
  await genPython(CFG, recorder);

  const outputPath = path.join(__dirname, "parkrun_search.py");
  console.log("Generated steps:", recorder.getSteps());

  await stagehand.close();
})();
