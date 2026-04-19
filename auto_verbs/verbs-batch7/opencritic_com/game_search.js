const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * OpenCritic – Game Search
 *
 * Searches OpenCritic for a game and extracts: game title, top critic
 * average score, percent recommended, platforms, and release date.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  siteUrl: "https://opencritic.com",
  query: "Elden Ring",
};

function genPython(cfg, recorder) {
  return `# See game_search.py (generated directly)`;
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
    recorder.recordNavigation(CFG.siteUrl);
    await page.goto(CFG.siteUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    // Type the game name into the search box
    const searchInput = await page.$('input[type="search"], input[placeholder*="earch"]');
    await searchInput.click();
    await page.keyboard.type(CFG.query, { delay: 50 });
    await page.waitForTimeout(2000);

    // Press Enter to navigate to the first result
    await page.keyboard.press("Enter");
    await page.waitForTimeout(5000);

    const result = await stagehand.extract(
      `Extract the game's title, top critic average score, percent recommended, platforms, and release date.`,
      {
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            topCriticAverage: { type: "string" },
            percentRecommended: { type: "string" },
            platforms: { type: "string" },
            releaseDate: { type: "string" },
          },
        },
      },
    );

    console.log("Extracted:", JSON.stringify(result, null, 2));

    // ── Save recorded actions ──────────────────────────────────────────────
    const actions = recorder.getActions();
    const outPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(outPath, JSON.stringify({ cfg: CFG, actions }, null, 2));
    console.log(`Saved ${actions.length} action(s) → ${outPath}`);

    // ── Generate Python code ───────────────────────────────────────────────
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "game_search.py.gen");
    fs.writeFileSync(pyPath, pyCode);
    console.log(`Generated Python → ${pyPath}`);
  } finally {
    await stagehand.close();
  }
})();
