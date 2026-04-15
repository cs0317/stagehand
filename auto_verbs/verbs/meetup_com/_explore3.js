const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    // Try with lat/lng for Denver in URL
    const url = "https://www.meetup.com/find/?keywords=hiking&location=us--co--Denver&source=GROUPS&eventType=group";
    console.log("Loading", url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 10000));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    console.log("Lines:", lines.length);
    // Show header + first 5 groups
    for (let i = 0; i < Math.min(lines.length, 80); i++) {
      console.log(i + ": " + lines[i]);
    }
  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
