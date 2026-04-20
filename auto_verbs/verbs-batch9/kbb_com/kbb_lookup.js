const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { make: "toyota", model: "rav4", year: "2021" };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.kbb.com/${CFG.make}/${CFG.model}/${CFG.year}/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const data = await page.evaluate(() => {
      const text = document.body.innerText.replace(/\s+/g, ' ');
      const result = { trade_in: '', private_party: '', retail: '', fair_market_range: '' };

      const tradeMatch = text.match(/trade.?in.*?(\$[\d,]+)/i);
      if (tradeMatch) result.trade_in = tradeMatch[1];

      const privateMatch = text.match(/private\s*party.*?(\$[\d,]+)/i);
      if (privateMatch) result.private_party = privateMatch[1];

      const retailMatch = text.match(/(?:suggested\s*retail|dealer\s*retail).*?(\$[\d,]+)/i);
      if (retailMatch) result.retail = retailMatch[1];

      const rangeMatch = text.match(/fair\s*(?:market|purchase)?\s*(?:range|price).*?(\$[\d,]+\s*[-–]\s*\$[\d,]+)/i);
      if (rangeMatch) result.fair_market_range = rangeMatch[1];

      // Also try to grab any price values displayed on the page
      const prices = [];
      const priceEls = document.querySelectorAll('[class*="price"], [class*="value"], [class*="Price"]');
      priceEls.forEach(el => {
        const t = el.textContent.trim();
        if (t.includes('$')) prices.push(t);
      });
      result.displayed_prices = prices.slice(0, 10);

      return result;
    });

    recorder.record("extract", data);
    console.log("Extracted:", JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
