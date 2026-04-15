const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    // Try ESPN for Seahawks schedule with past season results
    const url = "https://www.espn.com/nfl/team/schedule/_/name/sea/seattle-seahawks";
    console.log("Loading", url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 8000));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    console.log("Lines:", lines.length);
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      console.log(i + ": " + lines[i]);
    }
  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
