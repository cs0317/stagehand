const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * FuelEconomy.gov – Vehicle fuel economy lookup
 *
 * Extracts: trim, fuel_type, city_mpg, highway_mpg, combined_mpg.
 */

const CFG = {
  year: 2025,
  make: "Toyota",
  model: "Camry",
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  return `# See fueleconomy_lookup.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const url = `https://www.fueleconomy.gov/feg/bymodel/${CFG.year}_${CFG.make}_${CFG.model}.shtml`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "fueleconomy", "Navigate to FuelEconomy.gov vehicle page");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract all vehicle trims with trim name, fuel type, city MPG, highway MPG, and combined MPG.`
    );
    recorder.record("extract", "fuel_data", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "fueleconomy_lookup.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
