/**
 * _explore.js – Chewy.com DOM explorer
 * Run: node verbs/chewy_com/_explore.js
 */
const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  await page.goto("https://www.chewy.com/s?rh=c%3A288&query=dog+food+grain+free");
  await page.waitForLoadState("domcontentloaded");
  await new Promise(r => setTimeout(r, 8000));
  console.log("URL:", page.url());

  // Check selectors
  const selectors = [
    "[data-testid*='product']",
    "article",
    ".product-card",
    "[class*='ProductCard']",
    "[class*='product']",
    "section.results",
  ];
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    if (count > 0) console.log(`${sel}: ${count} elements`);
  }

  // Text dump
  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split("\n").filter(l => l.trim());
  console.log(`\nText lines: ${lines.length}`);
  lines.slice(0, 100).forEach((l, i) => console.log(`[${i}] ${l.substring(0, 140)}`));

  await stagehand.close();
})();
