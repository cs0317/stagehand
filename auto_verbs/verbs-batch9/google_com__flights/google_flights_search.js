const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { from: "SFO", to: "JFK", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    // Build a date about 1 month from now
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    const dateStr = d.toISOString().split("T")[0];

    const url = `https://www.google.com/travel/flights?q=Flights%20from%20${CFG.from}%20to%20${CFG.to}%20on%20${dateStr}%20one%20way`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const items = await page.evaluate((max) => {
      const results = [];
      // Google Flights uses list items for flight results
      const rows = document.querySelectorAll('li[class*="pIav2d"], [class*="Rk10dc"], ul[class*="Rk10dc"] > li, [data-resultid]');
      for (const row of rows) {
        if (results.length >= max) break;
        const text = (row.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length < 20) continue;

        // Try to extract airline
        let airline = '';
        const airlineEl = row.querySelector('[class*="Ir0Voe"], [class*="sSHqwe"], span[class*="airline"]');
        if (airlineEl) airline = airlineEl.textContent.trim();

        // Try to extract times
        let departure = '', arrival = '';
        const timeEls = row.querySelectorAll('[class*="wtdjmc"], span[aria-label*="Departure"], span[aria-label*="Arrival"]');
        if (timeEls.length >= 2) {
          departure = timeEls[0].textContent.trim();
          arrival = timeEls[1].textContent.trim();
        }
        if (!departure) {
          const timeMatch = text.match(/(\d{1,2}:\d{2}\s*[APap][Mm])/g);
          if (timeMatch && timeMatch.length >= 2) {
            departure = timeMatch[0];
            arrival = timeMatch[1];
          }
        }

        // Duration
        let duration = '';
        const durMatch = text.match(/(\d+\s*hr?\s*\d*\s*min?)/i);
        if (durMatch) duration = durMatch[1];

        // Stops
        let stops = '';
        const stopsMatch = text.match(/(Nonstop|\d+\s*stop)/i);
        if (stopsMatch) stops = stopsMatch[1];

        // Price
        let price = '';
        const priceEl = row.querySelector('[class*="price"], [class*="YMlIz"]');
        if (priceEl) price = priceEl.textContent.trim();
        if (!price) {
          const priceMatch = text.match(/\$[\d,]+/);
          if (priceMatch) price = priceMatch[0];
        }

        if (!airline && !departure && !price) continue;

        results.push({ airline, departure, arrival, duration, stops, price });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
