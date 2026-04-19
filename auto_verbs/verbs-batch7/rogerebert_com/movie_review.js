const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * RogerEbert.com – Movie Review Lookup
 *
 * Navigate to a specific movie review page on RogerEbert.com and extract
 * the title, star rating, review date, author, and opening paragraph.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  movieSlug: "parasite-movie-review-2019",
};

function genPython(cfg, recorder) {
  return `# See movie_review.py (generated directly)`;
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
    const url = `https://www.rogerebert.com/reviews/${CFG.movieSlug}`;
    recorder.recordNavigation(url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const review = await stagehand.extract(
      `Extract the movie review details: title, star rating (out of 4), review date, author name, and the opening paragraph of the review.`,
      {
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            starRating: { type: "string" },
            reviewDate: { type: "string" },
            author: { type: "string" },
            openingParagraph: { type: "string" },
          },
        },
      },
    );

    console.log("Extracted review:", JSON.stringify(review, null, 2));

    // ── Save recorded actions ──────────────────────────────────────────────
    const actions = recorder.getActions();
    const outPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(outPath, JSON.stringify({ cfg: CFG, actions }, null, 2));
    console.log(`Saved ${actions.length} action(s) → ${outPath}`);

    // ── Generate Python code ───────────────────────────────────────────────
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "movie_review.py.gen");
    fs.writeFileSync(pyPath, pyCode);
    console.log(`Generated Python → ${pyPath}`);
  } finally {
    await stagehand.close();
  }
})();
