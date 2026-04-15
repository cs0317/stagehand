const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const url = "https://www.mlb.com/standings";
    console.log("Loading", url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 10000));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    console.log("Lines:", lines.length);
    // Search for AL standings related content
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].toLowerCase();
      if (l.includes("american") || l.includes("al ") || l.includes("standings") || l.includes("wins") || l.includes("w\t") || l.includes("east") || l.includes("west") || l.includes("central")) {
        console.log(i + ": " + lines[i]);
      }
    }
    console.log("\n--- Lines 0-80 ---");
    for (let i = 0; i < Math.min(80, lines.length); i++) {
      console.log(i + ": " + lines[i]);
    }
  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
