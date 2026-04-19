const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * OpenSecrets – Lobbying Issue Search
 *
 * Searches OpenSecrets lobbying data by issue area (e.g. Science & Technology)
 * and extracts the top lobbying clients: name, subsidiary, and number of reports.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  issueCode: "SCI",  // Science & Technology
  cycle: "2024",
  topic: "technology",
};

function genPython(cfg, recorder) {
  return `# See lobbying_search.py (generated directly)`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
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
    const url = `https://www.opensecrets.org/federal-lobbying/issues/summary?id=${CFG.issueCode}&cycle=${CFG.cycle}`;
    recorder.recordNavigation(url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const result = await stagehand.extract(
      `Extract the top 5 lobbying clients from the table: client name, subsidiary (if any), and number of reports.`,
      {
        schema: {
          type: "object",
          properties: {
            clients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  subsidiary: { type: "string" },
                  numReports: { type: "string" },
                },
              },
            },
          },
        },
      },
    );

    console.log("Extracted:", JSON.stringify(result, null, 2));

    // ── Save recorded actions ──────────────────────────────────────────────
    const actions = recorder.getActions();
    const outPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(outPath, JSON.stringify({ cfg: CFG, actions }, null, 2));
    console.log(`Saved ${actions.length} action(s) → ${outPath}`);

    // ── Generate Python code ───────────────────────────────────────────────
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "lobbying_search.py.gen");
    fs.writeFileSync(pyPath, pyCode);
    console.log(`Generated Python → ${pyPath}`);
  } finally {
    await stagehand.close();
  }
})();
