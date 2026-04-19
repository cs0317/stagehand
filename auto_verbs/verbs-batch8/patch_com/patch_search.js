const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  search_query: "community events",
  max_results: 5,
};

async function genPython(cfg, recorder) {
  const url = `https://patch.com/search?q=${encodeURIComponent(cfg.search_query)}`;

  recorder.addStep(`page.goto("${url}")`);
  recorder.addStep(`page.wait_for_load_state("networkidle")`);
  recorder.addStep(`import time; time.sleep(2)`);

  recorder.addStep(`items = page.evaluate("""() => {
    const results = [];
    const articles = document.querySelectorAll('[class*="search-result"], [class*="card"], article, .story, [class*="article"]');
    for (let i = 0; i < Math.min(articles.length, ${cfg.max_results}); i++) {
      const el = articles[i];
      const titleEl = el.querySelector('h2 a, h3 a, [class*="title"] a, [class*="headline"] a');
      const locationEl = el.querySelector('[class*="location"], [class*="patch-name"], [class*="source"]');
      const dateEl = el.querySelector('time, [class*="date"], [class*="timestamp"]');
      const summaryEl = el.querySelector('[class*="summary"], [class*="description"], [class*="excerpt"], p');
      const linkEl = el.querySelector('a[href*="patch.com"]') || el.querySelector('h2 a, h3 a');
      results.push({
        title: titleEl ? titleEl.innerText.trim() : '',
        location: locationEl ? locationEl.innerText.trim() : '',
        publish_date: dateEl ? dateEl.innerText.trim() : '',
        summary: summaryEl ? summaryEl.innerText.trim() : '',
        url: linkEl ? linkEl.href : ''
      });
    }
    return results.filter(r => r.title);
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

  const outputPath = path.join(__dirname, "patch_search.py");
  console.log("Generated steps:", recorder.getSteps());

  await stagehand.close();
})();
