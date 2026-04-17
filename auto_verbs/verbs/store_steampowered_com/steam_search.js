const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Steam Store – Game Search
 *
 * Search Steam for games and extract listings with prices, dates, and reviews.
 */

const CFG = {
  searchTerm: "open world RPG",
  maxResults: 5,
  waits: { page: 3000 },
};

function genPython(cfg, recorder) {
  return `# Auto-generated Steam game search script
# Search: "${cfg.searchTerm}" | ${recorder.actions.length} recorded interactions
`;
}

async function extractGames(stagehand, page, recorder) {
  console.log(`🎯 Extract up to ${CFG.maxResults} games...\n`);
  const { z } = require("zod/v3");

  const data = await stagehand.extract(
    `Extract up to ${CFG.maxResults} game search results. For each game, get the title, price, release date, and review summary (e.g. "Very Positive", "Mixed", etc.).`,
    z.object({
      games: z.array(z.object({
        title: z.string().describe("Game title"),
        price: z.string().describe("Price (e.g. '$59.99' or 'Free')"),
        release_date: z.string().describe("Release date"),
        review_summary: z.string().describe("Review summary (e.g. 'Very Positive')"),
      })).describe(`Up to ${CFG.maxResults} games`),
    })
  );

  recorder.record("extract", { instruction: "Extract game search results", results: data });

  console.log(`📋 Found ${data.games.length} games:`);
  data.games.forEach((g, i) => {
    console.log(`   ${i + 1}. ${g.title}`);
    console.log(`      Price: ${g.price}  Released: ${g.release_date}  Reviews: ${g.review_summary}`);
  });
  return data;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Steam Store – Game Search");
  console.log(`  🔎 Search: "${CFG.searchTerm}"\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: { headless: false, viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars"] },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    const searchUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(CFG.searchTerm)}`;
    recorder.goto(searchUrl);
    await page.goto(searchUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    const data = await extractGames(stagehand, page, recorder);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${data.games.length} games found`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    return data;
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

main().catch(console.error);
