/**
 * _explore.js – BBB.org DOM explorer
 * Run: node verbs/bbb_org/_explore.js
 */
const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  // Go directly to search results
  await page.goto("https://www.bbb.org/search?find_text=Comcast&find_type=Category");
  await page.waitForLoadState("networkidle");
  await new Promise(r => setTimeout(r, 5000));
  console.log("URL:", page.url());

  // Check if we see results
  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split("\n").filter(l => l.trim());
  console.log(`Text lines: ${lines.length}`);
  lines.slice(0, 80).forEach((l, i) => console.log(`[${i}] ${l.substring(0, 140)}`));

  // Try to click the first result and see the profile page
  try {
    await stagehand.act("click the first business result link");
    await page.waitForLoadState("networkidle");
    await new Promise(r => setTimeout(r, 5000));
    console.log("\n=== PROFILE PAGE ===");
    console.log("URL:", page.url());
    const profileText = await page.evaluate(() => document.body.innerText);
    const profileLines = profileText.split("\n").filter(l => l.trim());
    console.log(`Profile text lines: ${profileLines.length}`);
    profileLines.slice(0, 100).forEach((l, i) => console.log(`[${i}] ${l.substring(0, 140)}`));
  } catch (e) {
    console.log("Could not click result:", e.message);
  }

  await stagehand.close();
})();
