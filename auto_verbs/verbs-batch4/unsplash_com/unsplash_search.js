const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Unsplash – Photo Search
 *
 * Search for photos on Unsplash and extract listings with photographer name,
 * description/alt text, and number of likes.
 */

const CFG = {
  url: "https://unsplash.com",
  searchTerm: "mountain landscape",
  maxResults: 5,
  waits: { page: 3000, extract: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `# Auto-generated – see unsplash_search.py for the standalone version.
# Generated on: ${ts} with ${n} recorded interactions.
`;
}

(async () => {
  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 1, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const slug = CFG.searchTerm.replace(/ /g, "-");
    const searchUrl = `${CFG.url}/s/photos/${encodeURIComponent(slug)}`;
    console.log(`\n🌐 Navigating to ${searchUrl}...`);
    await page.goto(searchUrl);
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: `Search for "${CFG.searchTerm}"` });

    const { z } = require("zod/v3");
    const data = await stagehand.extract(
      `Extract up to ${CFG.maxResults} photo listings. For each photo get: photographer name, photo description or alt text, and number of likes.`,
      z.object({
        photos: z.array(z.object({
          photographer_name: z.string(),
          description: z.string(),
          num_likes: z.string(),
        })),
      })
    );
    recorder.record("extract", { instruction: "Extract photo listings", results: data });

    console.log(`\n📊 Found ${data.photos.length} photos:\n`);
    data.photos.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.photographer_name}: ${p.description}`);
      console.log(`     Likes: ${p.num_likes}`);
    });

    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`\n💾 Saved files.`);
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await stagehand.close();
  }
})();
