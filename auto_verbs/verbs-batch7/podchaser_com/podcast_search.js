const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Podchaser – Podcast Search
 *
 * Searches Podchaser for podcasts and extracts the top results:
 * podcast name, description, and categories.
 */

const CFG = {
  query: "true crime",
};

function genPython(cfg, recorder) {
  return `# See podcast_search.py (generated directly)`;
}

(async () => {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    enableCaching: false,
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder(page);

  try {
    const url = `https://www.podchaser.com/search/podcasts?q=${encodeURIComponent(CFG.query)}`;
    recorder.recordNavigation(url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const result = await stagehand.extract(
      `Extract the first 5 podcast search results: podcast name, description, and categories.`,
      {
        schema: {
          type: "object",
          properties: {
            podcasts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  categories: { type: "string" },
                },
              },
            },
          },
        },
      },
    );

    console.log("Extracted:", JSON.stringify(result, null, 2));

    const actions = recorder.getActions();
    const outPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(outPath, JSON.stringify({ cfg: CFG, actions }, null, 2));
    console.log(`Saved ${actions.length} action(s) → ${outPath}`);

    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "podcast_search.py.gen");
    fs.writeFileSync(pyPath, pyCode);
    console.log(`Generated Python → ${pyPath}`);
  } finally {
    await stagehand.close();
  }
})();
