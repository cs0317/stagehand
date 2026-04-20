const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  search_query: "technology",
  max_results: 5,
};

async function genPython(cfg, recorder) {
  const url = `https://www.newyorker.com/search/q/${encodeURIComponent(cfg.search_query)}`;

  recorder.addStep(`page.goto("${url}")`);
  recorder.addStep(`page.wait_for_load_state("networkidle")`);
  recorder.addStep(`import time; time.sleep(2)`);

  recorder.addStep(`items = page.evaluate("""() => {
    const results = [];
    const articles = document.querySelectorAll('[class*="River__riverItem"], [class*="search-result"], article');
    for (let i = 0; i < Math.min(articles.length, ${cfg.max_results}); i++) {
      const el = articles[i];
      const titleEl = el.querySelector('h4, h3, h2, [class*="title"], [class*="hed"]');
      const authorEl = el.querySelector('[class*="byline"], [class*="author"]');
      const dateEl = el.querySelector('time, [class*="date"], [class*="timestamp"]');
      const sectionEl = el.querySelector('[class*="rubric"], [class*="section"], [class*="category"]');
      const summaryEl = el.querySelector('[class*="dek"], [class*="summary"], [class*="description"], p');
      results.push({
        title: titleEl ? titleEl.innerText.trim() : '',
        author: authorEl ? authorEl.innerText.trim().replace(/^by\\s*/i, '') : '',
        publish_date: dateEl ? dateEl.innerText.trim() : '',
        section: sectionEl ? sectionEl.innerText.trim() : '',
        summary: summaryEl ? summaryEl.innerText.trim() : ''
      });
    }
    return results;
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

  const outputPath = path.join(__dirname, "newyorker_search.py");
  console.log("Generated steps:", recorder.getSteps());

  await stagehand.close();
})();
