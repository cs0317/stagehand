const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Reelgood – Genre Movie Search
 *
 * Browse movies by genre on Reelgood and extract title, release year,
 * and detail URL from the movie grid.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  genre: "thriller",
  maxResults: 5,
};

function genPython(cfg, recorder) {
  return `# See genre_movies.py (generated directly)`;
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
    const url = `https://reelgood.com/movies/genre/${CFG.genre}`;
    recorder.recordNavigation(url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const movies = await stagehand.extract(
      `Extract the first ${CFG.maxResults} non-promoted ${CFG.genre} movies. For each movie get: title, release year, and detail URL.`,
      {
        schema: {
          type: "object",
          properties: {
            movies: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  year: { type: "string" },
                  url: { type: "string" },
                },
              },
            },
          },
        },
      },
    );

    console.log("Extracted movies:", JSON.stringify(movies, null, 2));

    // ── Save recorded actions ──────────────────────────────────────────────
    const actions = recorder.getActions();
    const outPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(outPath, JSON.stringify({ cfg: CFG, actions }, null, 2));
    console.log(`Saved ${actions.length} action(s) → ${outPath}`);

    // ── Generate Python code ───────────────────────────────────────────────
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "genre_movies.py.gen");
    fs.writeFileSync(pyPath, pyCode);
    console.log(`Generated Python → ${pyPath}`);
  } finally {
    await stagehand.close();
  }
})();
