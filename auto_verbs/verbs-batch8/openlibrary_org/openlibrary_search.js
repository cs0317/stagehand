const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  search_query: "machine learning",
  max_results: 5,
};

async function genPython(cfg, recorder) {
  const url = `https://openlibrary.org/search?q=${encodeURIComponent(cfg.search_query)}`;

  recorder.addStep(`page.goto("${url}")`);
  recorder.addStep(`page.wait_for_load_state("networkidle")`);
  recorder.addStep(`import time; time.sleep(2)`);

  recorder.addStep(`items = page.evaluate("""() => {
    const results = [];
    const rows = document.querySelectorAll('.searchResultItem, [class*="search-result"], li[class*="book"]');
    for (let i = 0; i < Math.min(rows.length, ${cfg.max_results}); i++) {
      const el = rows[i];
      const titleEl = el.querySelector('.booktitle a, h3 a, [class*="title"] a');
      const authorEl = el.querySelector('.bookauthor a, [class*="author"] a');
      const yearEl = el.querySelector('.publishedYear, [class*="year"], [class*="date"]');
      const publisherEl = el.querySelector('.publisher, [class*="publisher"]');
      const editionsEl = el.querySelector('.editioncount, [class*="edition"]');
      const isbnEl = el.querySelector('[class*="isbn"]');
      const subjectsEl = el.querySelector('[class*="subject"]');
      const edText = editionsEl ? editionsEl.innerText.trim() : '0';
      const edMatch = edText.match(/(\\d+)/);
      results.push({
        title: titleEl ? titleEl.innerText.trim() : '',
        author: authorEl ? authorEl.innerText.trim() : '',
        first_publish_year: yearEl ? yearEl.innerText.trim().replace(/[^0-9]/g, '') : '',
        publisher: publisherEl ? publisherEl.innerText.trim() : '',
        num_editions: edMatch ? parseInt(edMatch[1]) : 0,
        isbn: isbnEl ? isbnEl.innerText.trim() : '',
        subjects: subjectsEl ? subjectsEl.innerText.trim() : ''
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

  const outputPath = path.join(__dirname, "openlibrary_search.py");
  console.log("Generated steps:", recorder.getSteps());

  await stagehand.close();
})();
