const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const url = "https://www.potterybarn.com/search/results.html?words=sofa";
    console.log("Loading " + url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 10000));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(lines.length, 250); i++) {
      console.log(i + ": " + lines[i]);
    }
    console.log("\nTotal lines:", lines.length);
  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
