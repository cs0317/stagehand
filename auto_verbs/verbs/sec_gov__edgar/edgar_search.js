const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * SEC EDGAR – Filing Search
 * Search for SEC filings by company ticker.
 */

const CFG = {
  ticker: "TSLA",
  maxResults: 5,
  waits: { page: 3000 },
};

async function extractFilings(stagehand, page, recorder) {
  const { z } = require("zod/v3");
  const data = await stagehand.extract(
    `Extract up to ${CFG.maxResults} SEC filings from the EDGAR results table. For each filing, get the filing type (e.g. 10-K, 8-K), filing date, description, and link to the filing document.`,
    z.object({
      filings: z.array(z.object({
        filing_type: z.string().describe("Filing type (e.g. '10-K', '8-K', '4')"),
        filing_date: z.string().describe("Filing date"),
        description: z.string().describe("Filing description"),
        filing_link: z.string().describe("URL to filing document"),
      })).describe(`Up to ${CFG.maxResults} filings`),
    })
  );
  recorder.record("extract", { instruction: "Extract SEC filings", results: data });
  data.filings.forEach((f, i) => {
    console.log(`   ${i + 1}. ${f.filing_type} - ${f.filing_date}: ${f.description.substring(0, 60)}`);
  });
  return data;
}

async function main() {
  console.log("  SEC EDGAR – Filing Search");
  console.log(`  Ticker: ${CFG.ticker}\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: { headless: false, viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled"] },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${CFG.ticker}&type=&dateb=&owner=include&count=40&action=getcompany`;
    recorder.goto(url);
    await page.goto(url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    const data = await extractFilings(stagehand, page, recorder);
    console.log(`\n✅ DONE — ${data.filings.length} filings found`);

    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    return data;
  } catch (err) {
    console.error("❌ Error:", err.message);
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

main().catch(console.error);
