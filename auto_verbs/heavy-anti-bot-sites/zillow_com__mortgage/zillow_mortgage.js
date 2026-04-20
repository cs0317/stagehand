const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.zillow.com/mortgage-rates/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { rates } = await stagehand.extract(
      `Extract current mortgage rates for 30-year fixed, 15-year fixed, and 5/1 ARM. For each get: loan type, rate, APR, and monthly payment for a $400,000 loan.`,
      z.object({
        rates: z.array(z.object({
          loanType: z.string().describe("Loan type (30-year fixed, 15-year fixed, 5/1 ARM)"),
          rate: z.string().describe("Interest rate"),
          apr: z.string().describe("APR"),
          monthlyPayment: z.string().describe("Monthly payment"),
        })),
      })
    );
    recorder.record("extract", { results: rates });
    console.log("Extracted:", JSON.stringify(rates, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
