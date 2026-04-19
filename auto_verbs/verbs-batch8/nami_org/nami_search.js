const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  search_query: "depression",
  max_results: 5,
};

async function genPython(cfg, recorder) {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    enableCaching: false,
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  const url = `https://www.nami.org/search?s=${encodeURIComponent(cfg.search_query)}`;
  recorder.recordNav(url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  recorder.recordExtract(
    "extract NAMI search results",
    [
      "title",
      "category",
      "summary",
      "url",
      "resource_type",
    ],
    cfg.max_results
  );

  const results = await stagehand.extract(
    `Extract up to ${cfg.max_results} search results from the NAMI search page. For each result extract: title, category (e.g. Mental Health Conditions, Support), summary (brief excerpt), url (link to the resource), and resource_type (e.g. Article, Blog Post, Guide, Fact Sheet).`,
    {
      schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                category: { type: "string" },
                summary: { type: "string" },
                url: { type: "string" },
                resource_type: { type: "string" },
              },
            },
          },
        },
      },
    }
  );

  console.log(JSON.stringify(results, null, 2));

  await stagehand.close();
  return results;
}

(async () => {
  const recorder = new PlaywrightRecorder();
  await genPython(CFG, recorder);
  const pyCode = recorder.toPythonScript("nami_search");
  const outPath = path.join(__dirname, "nami_search.py");
  fs.writeFileSync(outPath, pyCode);
  console.log(`Wrote ${outPath}`);
})();
