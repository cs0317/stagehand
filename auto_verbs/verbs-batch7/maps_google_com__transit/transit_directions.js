const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  origin: "Union Station, Los Angeles",
  destination: "Santa Monica Pier",
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  return `# See transit_directions.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const origin = encodeURIComponent(CFG.origin);
    const dest = encodeURIComponent(CFG.destination);
    await page.goto(`https://www.google.com/maps/dir/${origin}/${dest}/data=!3e3`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "transit_directions", "Navigate to Google Maps transit directions");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the transit route options: duration, departure time, arrival time, transit line names, and fare.`
    );
    recorder.record("extract", "routes", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
