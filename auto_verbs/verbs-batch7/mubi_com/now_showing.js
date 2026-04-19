const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * MUBI – Now Showing Films
 *
 * Browses MUBI's current film selection (Now Showing page) and extracts
 * film title, director, year, country of origin, and description.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://mubi.com/en/showing",
  maxResults: 5,
};

function genPython(cfg, recorder) {
  return `# See now_showing.py (generated directly)`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
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
    recorder.recordNavigation(CFG.url);
    await page.goto(CFG.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const films = await stagehand.extract(
      `Extract the first ${CFG.maxResults} films now showing. For each film get: title, director, year, country, and description.`,
      {
        schema: {
          type: "object",
          properties: {
            films: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  director: { type: "string" },
                  year: { type: "string" },
                  country: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
          },
        },
      },
    );

    console.log("Extracted films:", JSON.stringify(films, null, 2));

    // ── Save recorded actions ──────────────────────────────────────────────
    const actions = recorder.getActions();
    const outPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(outPath, JSON.stringify({ cfg: CFG, actions }, null, 2));
    console.log(`Saved ${actions.length} action(s) → ${outPath}`);

    // ── Generate Python code ───────────────────────────────────────────────
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "now_showing.py.gen");
    fs.writeFileSync(pyPath, pyCode);
    console.log(`Generated Python → ${pyPath}`);
  } finally {
    await stagehand.close();
  }
})();
