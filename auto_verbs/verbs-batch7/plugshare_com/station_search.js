const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * PlugShare – EV Charging Station Search
 *
 * Searches PlugShare directory for EV charging stations and extracts
 * station name, address, checkins, and detail URL.
 */

const CFG = {
  state: "california",
  city: "san-francisco",
};

function genPython(cfg, recorder) {
  return `# See station_search.py (generated directly)`;
}

(async () => {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    enableCaching: false,
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder(page);

  try {
    const url = `https://www.plugshare.com/directory/us/${CFG.state}/${CFG.city}`;
    recorder.recordNavigation(url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const result = await stagehand.extract(
      `Extract the first 5 EV charging stations: station name, address, number of checkins, and URL.`,
      {
        schema: {
          type: "object",
          properties: {
            stations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  address: { type: "string" },
                  checkins: { type: "string" },
                  url: { type: "string" },
                },
              },
            },
          },
        },
      },
    );

    console.log("Extracted:", JSON.stringify(result, null, 2));

    const actions = recorder.getActions();
    const outPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(outPath, JSON.stringify({ cfg: CFG, actions }, null, 2));
    console.log(`Saved ${actions.length} action(s) → ${outPath}`);

    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "station_search.py.gen");
    fs.writeFileSync(pyPath, pyCode);
    console.log(`Generated Python → ${pyPath}`);
  } finally {
    await stagehand.close();
  }
})();
