/**
 * _explore.js – Carvana DOM explorer
 * Run: node verbs/carvana_com/_explore.js
 */
const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  await page.goto("https://www.carvana.com/cars/honda-civic");
  await page.waitForLoadState("networkidle");
  await new Promise(r => setTimeout(r, 5000));
  console.log("URL:", page.url());

  // Check for product tiles
  const selectors = [
    "[data-testid*='vehicle']",
    "[data-testid*='result']",
    ".result-tile",
    ".vehicle-card",
    "article",
    "[class*='tile']",
    "[class*='result']",
    "[class*='vehicle']",
  ];
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    if (count > 0) console.log(`${sel}: ${count} elements`);
  }

  // Get first 2 product containers HTML
  const html = await page.evaluate(() => {
    const items = document.querySelectorAll("article, [class*='tile'], [class*='result-card'], [class*='vehicle']");
    return Array.from(items).slice(0, 2).map(el => el.outerHTML.substring(0, 2000)).join("\n---\n");
  });
  console.log("\n=== HTML SAMPLE ===\n", html.substring(0, 3000));

  // Text dump
  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split("\n").filter(l => l.trim());
  console.log("\n=== TEXT (first 100 lines) ===");
  lines.slice(0, 100).forEach((l, i) => console.log(`[${i}] ${l.substring(0, 140)}`));

  await stagehand.close();
})();
