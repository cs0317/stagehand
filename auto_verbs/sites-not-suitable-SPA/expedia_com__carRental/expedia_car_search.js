const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

function computeDates() {
  const today = new Date();
  const pickup = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const dropoff = new Date(pickup);
  dropoff.setDate(dropoff.getDate() + 3);
  const fmt = (d) => `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
  return { pickup: fmt(pickup), dropoff: fmt(dropoff) };
}
const dates = computeDates();

const CFG = { location: "Los Angeles", pickupDate: dates.pickup, dropoffDate: dates.dropoff, maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.expedia.com/Cars`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    // Try to fill pickup location
    const locationInput = page.locator('input[placeholder*="Pick-up"], input[placeholder*="location"], button:has-text("Pick-up location")').first();
    try {
      await locationInput.click({ timeout: 3000 });
      await page.keyboard.press("Control+a");
      await page.keyboard.type(CFG.location, { delay: 50 });
      await page.waitForTimeout(2000);
      // Select first suggestion
      const suggestion = page.locator('[role="option"], [data-stid*="suggestion"], li[class*="suggestion"]').first();
      try { await suggestion.click({ timeout: 3000 }); } catch(e) { await page.keyboard.press("Enter"); }
      await page.waitForTimeout(1000);
    } catch(e) { console.log("Could not fill location input:", e.message); }

    // Try to click search
    const searchBtn = page.locator('button:has-text("Search"), button[type="submit"], button[data-stid*="search"]').first();
    try {
      await searchBtn.click({ timeout: 3000 });
      await page.waitForTimeout(8000);
    } catch(e) { console.log("Could not click search:", e.message); }

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[data-stid*="car"], [class*="offer"], [class*="listing"], article, .car-result');
      for (const card of cards) {
        if (results.length >= max) break;
        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
        const titleEl = card.querySelector('h2, h3, h4, [class*="title"], [class*="car-name"]');
        const carType = titleEl ? titleEl.textContent.trim() : '';
        if (!carType || carType.length < 3) continue;
        if (results.some(r => r.car_type === carType)) continue;

        let company = '';
        const compEl = card.querySelector('[class*="supplier"], [class*="company"], [class*="vendor"], img[alt]');
        if (compEl) company = (compEl.getAttribute('alt') || compEl.textContent || '').trim();

        let pricePerDay = '';
        const pdMatch = text.match(/\$[\d,.]+\s*\/?\s*day/i);
        if (pdMatch) pricePerDay = pdMatch[0];

        let totalPrice = '';
        const tpMatch = text.match(/(?:total|est\.?)\s*\$[\d,.]+/i);
        if (tpMatch) totalPrice = tpMatch[0];
        if (!totalPrice) {
          const priceEls = card.querySelectorAll('[class*="price"]');
          for (const pe of priceEls) {
            const pt = pe.textContent.trim();
            if (pt.includes('$') && !pricePerDay.includes(pt)) { totalPrice = pt; break; }
          }
        }

        let features = '';
        const featEls = card.querySelectorAll('[class*="feature"], [class*="amenity"], li');
        const feats = [];
        for (const f of featEls) {
          const ft = f.textContent.trim();
          if (ft && ft.length < 50) feats.push(ft);
        }
        features = feats.slice(0, 5).join(', ');

        results.push({ car_type: carType, company, price_per_day: pricePerDay, total_price: totalPrice, features });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
