const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  search_query: "star wars",
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

  const url = `https://www.lego.com/en-us/search?q=${encodeURIComponent(cfg.search_query)}`;
  recorder.recordNav(url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  recorder.recordExtract(
    "extract LEGO set results",
    [
      "set_name",
      "set_number",
      "price",
      "age_range",
      "piece_count",
      "theme",
      "rating",
      "availability",
    ],
    cfg.max_results
  );

  const results = await stagehand.extract(
    `Extract up to ${cfg.max_results} LEGO set results from the search page. For each result extract: set_name, set_number, price, age_range, piece_count, theme, rating, and availability.`,
    {
      schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                set_name: { type: "string" },
                set_number: { type: "string" },
                price: { type: "string" },
                age_range: { type: "string" },
                piece_count: { type: "string" },
                theme: { type: "string" },
                rating: { type: "string" },
                availability: { type: "string" },
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
  const pyCode = recorder.toPythonScript("lego_search");
  const outPath = path.join(__dirname, "lego_search.py");
  fs.writeFileSync(outPath, pyCode);
  console.log(`Wrote ${outPath}`);
})();
