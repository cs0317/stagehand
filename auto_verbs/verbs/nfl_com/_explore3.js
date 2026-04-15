const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    // Try team page and the games/schedule links
    const urls = [
      "https://www.nfl.com/teams/seattle-seahawks/",
      "https://www.nfl.com/games/seahawks",
      "https://www.nfl.com/schedules/seattle-seahawks/",
    ];
    for (const url of urls) {
      console.log("\nTrying:", url);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await new Promise(r => setTimeout(r, 5000));
      console.log("  URL:", page.url());
      const text = await page.evaluate(() => document.body ? document.body.innerText : "");
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      const has404 = lines.some(l => l.includes("404"));
      console.log("  Lines:", lines.length, "Has 404:", has404);
      if (!has404) {
        for (let i = 0; i < Math.min(lines.length, 100); i++) {
          console.log("  " + i + ": " + lines[i]);
        }
        break;
      }
    }
  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
