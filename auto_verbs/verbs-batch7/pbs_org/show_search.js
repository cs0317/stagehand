const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * PBS – Show/Video Search
 *
 * Searches PBS for shows/videos and extracts the top results:
 * show name, episode title, description, and URL.
 */

const CFG = {
  query: "nature documentary",
};

function genPython(cfg, recorder) {
  return `# See show_search.py (generated directly)`;
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
    const url = `https://www.pbs.org/search/?q=${encodeURIComponent(CFG.query)}`;
    recorder.recordNavigation(url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const result = await stagehand.extract(
      `Extract the first 5 video search results: show name, episode title, description, and URL.`,
      {
        schema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  showName: { type: "string" },
                  episodeTitle: { type: "string" },
                  description: { type: "string" },
                  url: { type: "string" },
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
    const pyPath = path.join(__dirname, "show_search.py.gen");
    fs.writeFileSync(pyPath, pyCode);
    console.log(`Generated Python → ${pyPath}`);
  } finally {
    await stagehand.close();
  }
})();
