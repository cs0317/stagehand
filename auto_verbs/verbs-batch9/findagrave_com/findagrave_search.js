const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { lastName: "Roosevelt", location: "New York", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.findagrave.com/memorial/search?lastname=${encodeURIComponent(CFG.lastName)}&location=${encodeURIComponent(CFG.location)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="memorial"], [class*="search-result"], .memorial-item, tr, article');
      for (const card of cards) {
        if (results.length >= max) break;
        const nameEl = card.querySelector('a[class*="name"], h2, h3, [class*="memorial-name"], [class*="full-name"]');
        const fullName = nameEl ? nameEl.textContent.trim() : '';
        if (!fullName || fullName.length < 3) continue;
        if (results.some(r => r.full_name === fullName)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let birthDate = '';
        const birthEl = card.querySelector('[class*="birth"], [class*="born"]');
        if (birthEl) birthDate = birthEl.textContent.trim();
        if (!birthDate) {
          const bMatch = text.match(/(?:born?|b\.?)\s*(\d{1,2}\s+\w+\s+\d{4}|\d{4})/i);
          if (bMatch) birthDate = bMatch[1];
        }

        let deathDate = '';
        const deathEl = card.querySelector('[class*="death"], [class*="died"]');
        if (deathEl) deathDate = deathEl.textContent.trim();
        if (!deathDate) {
          const dMatch = text.match(/(?:died?|d\.?)\s*(\d{1,2}\s+\w+\s+\d{4}|\d{4})/i);
          if (dMatch) deathDate = dMatch[1];
        }

        let cemetery = '';
        const cemEl = card.querySelector('[class*="cemetery"], [class*="burial"]');
        if (cemEl) cemetery = cemEl.textContent.trim();

        let location = '';
        const locEl = card.querySelector('[class*="location"], [class*="place"]');
        if (locEl) location = locEl.textContent.trim();

        results.push({ full_name: fullName, birth_date: birthDate, death_date: deathDate, cemetery, location });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
