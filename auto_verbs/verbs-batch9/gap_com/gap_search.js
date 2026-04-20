const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "men's jeans", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.gap.com/browse/search.do?searchText=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="product-card"], [class*="product-tile"], article, [data-testid*="product"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h3, h2, a[class*="title"], [class*="product-name"], [class*="name"]');
        const name = titleEl ? titleEl.textContent.trim() : '';
        if (!name || name.length < 5) continue;
        if (results.some(r => r.name === name)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let style = '';
        const styleMatch = text.match(/(slim|straight|skinny|relaxed|bootcut|athletic|taper|wide|flare)/i);
        if (styleMatch) style = styleMatch[0];

        let price = '';
        const priceEl = card.querySelector('[class*="price"]');
        if (priceEl) price = priceEl.textContent.trim();
        if (!price) {
          const pMatch = text.match(/\$[\d,.]+/);
          if (pMatch) price = pMatch[0];
        }

        let colors = '';
        const colorEls = card.querySelectorAll('[class*="swatch"], [class*="color"], [aria-label*="color"]');
        if (colorEls.length > 0) {
          const cls = [];
          for (const c of colorEls) {
            const cl = (c.getAttribute('aria-label') || c.getAttribute('title') || '').trim();
            if (cl && !cls.includes(cl)) cls.push(cl);
          }
          colors = cls.slice(0, 5).join(', ');
        }

        let sizes = '';
        const sizeEls = card.querySelectorAll('[class*="size"], [data-testid*="size"]');
        if (sizeEls.length > 0) {
          const szs = [];
          for (const s of sizeEls) {
            const sz = s.textContent.trim();
            if (sz && sz.length < 10 && !szs.includes(sz)) szs.push(sz);
          }
          sizes = szs.join(', ');
        }

        results.push({ name, style, price, colors, sizes });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
