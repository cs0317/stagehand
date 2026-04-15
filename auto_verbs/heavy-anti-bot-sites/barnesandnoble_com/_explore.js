/**
 * _explore.js – Barnes & Noble DOM explorer
 * Run: node verbs/barnesandnoble_com/_explore.js
 */
const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const { client, model, fallbackClient, fallbackModel } = setupLLMClient("hybrid");
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    llmClient: client,
    model,
    fallbackClient,
    fallbackModel,
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  await page.goto("https://www.barnesandnoble.com/s/Brandon+Sanderson");
  await page.waitForLoadState("domcontentloaded");
  await new Promise(r => setTimeout(r, 5000));

  console.log("URL:", page.url());

  // Check for product grid
  const selectors = [
    "ol.product-shelf-list li",
    "div.product-shelf-grid li",
    ".product-shelf li",
    "[data-testid*='product']",
    ".result-item",
    "section.product-shelf",
    ".product-shelf-title",
  ];
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    if (count > 0) console.log(`${sel}: ${count} elements`);
  }

  // Get first few product containers
  const html = await page.evaluate(() => {
    const items = document.querySelectorAll("ol.product-shelf-list li, div.product-shelf-grid li, .product-shelf li");
    if (items.length > 0) {
      return Array.from(items).slice(0, 2).map(el => el.outerHTML.substring(0, 1500)).join("\n---\n");
    }
    return document.body.innerHTML.substring(0, 3000);
  });
  console.log("\n=== HTML SAMPLE ===\n", html);

  // Text dump
  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split("\n").filter(l => l.trim()).slice(0, 80);
  console.log("\n=== TEXT (first 80 lines) ===");
  lines.forEach((l, i) => console.log(`[${i}] ${l.substring(0, 120)}`));

  await stagehand.close();
})();
