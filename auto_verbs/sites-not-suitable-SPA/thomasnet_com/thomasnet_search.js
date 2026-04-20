const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "CNC machining services", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.thomasnet.com/nsearch.html?cov=NA&heading=CNC+Machining+Services&what=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { suppliers } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} suppliers. For each get: company name, location, annual revenue range, number of employees, and certifications.`,
      z.object({
        suppliers: z.array(z.object({
          company: z.string().describe("Company name"),
          location: z.string().describe("Location"),
          revenue: z.string().describe("Annual revenue range"),
          employees: z.string().describe("Number of employees"),
          certifications: z.string().describe("Certifications"),
        })),
      })
    );
    const items = suppliers.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
