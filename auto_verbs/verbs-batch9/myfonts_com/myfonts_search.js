const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  search_query: "serif",
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

  const url = `https://www.myfonts.com/search/${encodeURIComponent(cfg.search_query)}`;
  recorder.recordNav(url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);

  recorder.recordExtract(
    "extract font results",
    [
      "font_name",
      "foundry",
      "price",
      "num_styles",
      "classification",
      "sample_text",
    ],
    cfg.max_results
  );

  const results = await stagehand.extract(
    `Extract up to ${cfg.max_results} font results from the search page. For each font extract: font_name, foundry (the type foundry), price (starting price), num_styles (number of styles/weights), classification (e.g. Serif, Sans Serif), and sample_text (the preview text shown).`,
    {
      schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                font_name: { type: "string" },
                foundry: { type: "string" },
                price: { type: "string" },
                num_styles: { type: "string" },
                classification: { type: "string" },
                sample_text: { type: "string" },
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
  const pyCode = recorder.toPythonScript("myfonts_search");
  const outPath = path.join(__dirname, "myfonts_search.py");
  fs.writeFileSync(outPath, pyCode);
  console.log(`Wrote ${outPath}`);
})();
