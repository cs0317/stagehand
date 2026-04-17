const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Reverb – Musical Instrument Search
 * Search for instruments and extract listings with title, condition, price.
 */

const CFG = {
  searchTerm: "Fender Stratocaster",
  maxResults: 5,
  waits: { page: 5000, content: 2000 },
};

async function extractListings(stagehand, page, recorder) {
  const { z } = require("zod/v3");
  const data = await stagehand.extract(
    `Extract up to ${CFG.maxResults} musical instrument listings from the Reverb marketplace search results. For each listing, get the item title, condition (e.g. "Used – Good", "Brand New"), and price.`,
    z.object({
      listings: z.array(z.object({
        item_title: z.string().describe("Full instrument title"),
        condition: z.string().describe("Condition (e.g. 'Used – Good', 'Brand New')"),
        price: z.string().describe("Price including dollar sign"),
      })).describe(`Up to ${CFG.maxResults} listings`),
    })
  );
  recorder.record("extract", { instruction: "Extract Reverb listings", results: data });
  data.listings.forEach((l, i) => {
    console.log(`   ${i + 1}. ${l.item_title}`);
    console.log(`      Price: ${l.price}  Condition: ${l.condition}`);
  });
  return data;
}

async function main() {
  console.log("  Reverb – Musical Instrument Search");
  console.log(`  Search: "${CFG.searchTerm}"\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: { headless: false, viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled"] },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    const url = `https://reverb.com/marketplace?query=${encodeURIComponent(CFG.searchTerm)}`;
    recorder.goto(url);
    await page.goto(url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    // Reverb SPA does client-side redirects — wait for item links to appear
    for (let i = 0; i < 15; i++) {
      try {
        const count = await page.evaluate(() => document.querySelectorAll("a[href*='/item/']").length);
        if (count > 0) break;
      } catch (_) {}
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(CFG.waits.content);

    const data = await extractListings(stagehand, page, recorder);
    console.log(`\n✅ DONE — ${data.listings.length} listings found`);

    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    return data;
  } catch (err) {
    console.error("❌ Error:", err.message);
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

main().catch(console.error);
