const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const url = "https://www.espn.com/nfl/team/schedule/_/name/sea/seattle-seahawks";
    console.log("Loading", url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 8000));

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    // Find schedule-related content
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].toLowerCase();
      if (l.includes("schedule") || l.includes("week") || l.includes("regular season") || l.includes("postseason") || l.includes("preseason") || l.includes("result")) {
        console.log(i + ": " + lines[i]);
      }
    }
    // Print lines 100-250
    console.log("\n--- Lines 100-250 ---");
    for (let i = 100; i < Math.min(250, lines.length); i++) {
      console.log(i + ": " + lines[i]);
    }
  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
