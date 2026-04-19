const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  search_query: "vegan pasta",
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

  const url = `https://minimalistbaker.com/?s=${encodeURIComponent(cfg.search_query)}`;
  recorder.recordNav(url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  recorder.recordExtract(
    "extract recipe results",
    [
      "recipe_name",
      "total_time",
      "servings",
      "rating",
      "description",
      "diet_tags",
    ],
    cfg.max_results
  );

  const results = await stagehand.extract(
    `Extract up to ${cfg.max_results} recipe results from the search page. For each result extract: recipe_name, total_time, servings, rating, description, and diet_tags (e.g. vegan, gluten-free).`,
    {
      schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                recipe_name: { type: "string" },
                total_time: { type: "string" },
                servings: { type: "string" },
                rating: { type: "string" },
                description: { type: "string" },
                diet_tags: { type: "string" },
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
  const pyCode = recorder.toPythonScript("minimalistbaker_search");
  const outPath = path.join(__dirname, "minimalistbaker_search.py");
  fs.writeFileSync(outPath, pyCode);
  console.log(`Wrote ${outPath}`);
})();
