const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { from: "Boston", to: "London", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const today = new Date();
    const depart = new Date(today);
    depart.setMonth(depart.getMonth() + 1);
    const ret = new Date(depart);
    ret.setDate(ret.getDate() + 7);
    const fmt = (d) => d.toISOString().split('T')[0];
    const url = `https://www.kayak.com/flights/${CFG.from}-${CFG.to}/${fmt(depart)}/${fmt(ret)}?sort=bestflight_a`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="resultInner"], [class*="nrc6-inner"], [class*="result-item"], [class*="Flights-Results"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const text = (card.textContent || '').replace(/\s+/g, ' ');
        if (text.length < 20) continue;

        let airline = '';
        const airEl = card.querySelector('[class*="codeshares"], [class*="airline"], img[alt]');
        if (airEl) airline = airEl.textContent?.trim() || airEl.getAttribute('alt') || '';

        let departure = '', arrival = '';
        const timeEls = card.querySelectorAll('[class*="time"], [class*="depart"], [class*="arrive"]');
        if (timeEls.length >= 2) {
          departure = timeEls[0].textContent.trim();
          arrival = timeEls[1].textContent.trim();
        }

        let duration = '';
        const durEl = card.querySelector('[class*="duration"], [class*="segment-duration"]');
        if (durEl) duration = durEl.textContent.trim();

        let stops = '';
        const stopEl = card.querySelector('[class*="stops"], [class*="stop-info"]');
        if (stopEl) stops = stopEl.textContent.trim();

        let price = '';
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        if (priceEl) price = priceEl.textContent.trim();

        if (!price && !airline) continue;
        results.push({ airline, departure, arrival, duration, stops, price });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
