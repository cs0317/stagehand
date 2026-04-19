const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * MyAnimeList – Anime Search
 *
 * Searches MyAnimeList for an anime and extracts the top result's details:
 * title, score, rank, episodes, aired dates, synopsis, and genres.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  searchUrl: "https://myanimelist.net/anime.php",
  query: "Steins;Gate",
};

function genPython(cfg, recorder) {
  return `# See anime_search.py (generated directly)`;
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
    const url = `${CFG.searchUrl}?q=${encodeURIComponent(CFG.query)}&cat=anime`;
    recorder.recordNavigation(url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const result = await stagehand.extract(
      `Extract the top anime search result's details: title, score, rank, episodes, aired dates, synopsis, and genres.`,
      {
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            score: { type: "string" },
            rank: { type: "string" },
            episodes: { type: "string" },
            aired: { type: "string" },
            synopsis: { type: "string" },
            genres: { type: "array", items: { type: "string" } },
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
    const pyPath = path.join(__dirname, "anime_search.py.gen");
    fs.writeFileSync(pyPath, pyCode);
    console.log(`Generated Python → ${pyPath}`);
  } finally {
    await stagehand.close();
  }
})();
