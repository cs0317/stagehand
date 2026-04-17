const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Transfermarkt – Player Search
 *
 * Search for a soccer player and extract their profile details.
 */

const CFG = {
  url: "https://www.transfermarkt.com",
  playerName: "Kylian Mbappé",
  waits: { page: 3000, nav: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `# Auto-generated – see transfermarkt_player.py for the standalone version.
# Generated on: ${ts} with ${recorder.actions.length} recorded interactions.
`;
}

(async () => {
  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 1, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const searchUrl = `${CFG.url}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(CFG.playerName)}`;
    console.log(`\n🌐 Navigating to ${searchUrl}...`);
    await page.goto(searchUrl);
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: `Search for "${CFG.playerName}"` });

    await observeAndAct(stagehand, page, recorder,
      "Click the first player result link",
      "Click top player result"
    );
    await page.waitForTimeout(CFG.waits.nav);

    const { z } = require("zod/v3");
    const data = await stagehand.extract(
      `Extract the player's profile info: name, current club, market value, age, nationality, and position.`,
      z.object({
        player_name: z.string(), current_club: z.string(), market_value: z.string(),
        age: z.string(), nationality: z.string(), position: z.string(),
      })
    );
    recorder.record("extract", { instruction: "Extract player profile", results: data });

    console.log(`\n📊 Player Profile:`);
    Object.entries(data).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`\n💾 Saved files.`);
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await stagehand.close();
  }
})();
