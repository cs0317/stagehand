const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    // Try the pricing/values page directly
    const url = "https://www.kbb.com/toyota/camry/2020/se-sedan-4d/";
    console.log("Loading", url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 8000));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    console.log("Lines:", lines.length);
    // Search for price/value related lines
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].toLowerCase();
      if (l.includes("price") || l.includes("value") || l.includes("trade") || l.includes("fair") || l.includes("range") || l.includes("$") || l.includes("private") || l.includes("dealer")) {
        console.log(i + ": " + lines[i]);
      }
    }
    console.log("\n--- Lines 100-200 ---");
    for (let i = 100; i < Math.min(200, lines.length); i++) {
      console.log(i + ": " + lines[i]);
    }
  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
