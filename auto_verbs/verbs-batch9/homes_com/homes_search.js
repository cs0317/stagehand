const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { location: "Portland, OR", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.homes.com/portland-or/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="property-card"], [class*="listing"], [class*="placard"], article, [data-listing-id]');
      for (const card of cards) {
        if (results.length >= max) break;

        const addrEl = card.querySelector('[class*="address"], [class*="street"], h2, h3');
        const address = addrEl ? addrEl.textContent.trim() : '';
        if (!address || address.length < 5) continue;
        if (results.some(r => r.address === address)) continue;

        let price = '';
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        if (priceEl) price = priceEl.textContent.trim();

        const text = (card.textContent || '').replace(/\s+/g, ' ');

        let beds = '';
        const bedMatch = text.match(/(\d+)\s*(?:bed|br|bd)/i);
        if (bedMatch) beds = bedMatch[1];

        let baths = '';
        const bathMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba)/i);
        if (bathMatch) baths = bathMatch[1];

        let sqft = '';
        const sqftMatch = text.match(/([\d,]+)\s*(?:sq\s*ft|sqft|sf)/i);
        if (sqftMatch) sqft = sqftMatch[1];

        let yearBuilt = '';
        const yearMatch = text.match(/(?:built|year)[:\s]*(\d{4})/i);
        if (yearMatch) yearBuilt = yearMatch[1];

        results.push({ address, price, beds, baths, sqft, year_built: yearBuilt });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
