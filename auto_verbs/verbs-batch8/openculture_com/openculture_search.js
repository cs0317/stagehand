const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  search_query: "philosophy",
  max_results: 5,
};

async function genPython(cfg, recorder) {
  const url = `https://www.openculture.com/?s=${encodeURIComponent(cfg.search_query)}+free+online+courses`;

  recorder.addStep(`page.goto("${url}")`);
  recorder.addStep(`page.wait_for_load_state("networkidle")`);
  recorder.addStep(`import time; time.sleep(2)`);

  recorder.addStep(`items = page.evaluate("""() => {
    const results = [];
    const articles = document.querySelectorAll('.post, article, .entry, [class*="result"]');
    for (let i = 0; i < Math.min(articles.length, ${cfg.max_results}); i++) {
      const el = articles[i];
      const titleEl = el.querySelector('h2 a, h3 a, .entry-title a, [class*="title"] a');
      const contentEl = el.querySelector('.entry-content, .post-content, p');
      const linkEl = el.querySelector('h2 a, h3 a, .entry-title a');
      const text = contentEl ? contentEl.innerText.trim() : '';
      const institutionMatch = text.match(/(?:from|at|by)\\s+([A-Z][\\w\\s]+(?:University|College|Institute|MIT|Stanford|Harvard|Yale|Oxford))/i);
      results.push({
        course_name: titleEl ? titleEl.innerText.trim() : '',
        institution: institutionMatch ? institutionMatch[1].trim() : '',
        instructor: '',
        subject: '${cfg.search_query}',
        format: text.match(/video/i) ? 'Video' : text.match(/audio/i) ? 'Audio' : 'Online Course',
        url: linkEl ? linkEl.href : ''
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

  const outputPath = path.join(__dirname, "openculture_search.py");
  console.log("Generated steps:", recorder.getSteps());

  await stagehand.close();
})();
