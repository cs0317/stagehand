const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * TaskRabbit – Tasker Search
 *
 * Multi-step booking flow: enter location, select item type, task size,
 * then browse available taskers with rates, ratings, and completed tasks.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  serviceType: "furniture assembly",
  location: "San Francisco, CA",
  maxResults: 5,
  bookUrl: "https://www.taskrabbit.com/book/2030/details?form_referrer=services_page",
  waits: { page: 3000, step: 2000, load: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `# Auto-generated TaskRabbit tasker search script
# Generated: ${ts} | ${n} recorded interactions
# Service: ${cfg.serviceType} in ${cfg.location}
`;
}

// ── Step Functions ────────────────────────────────────────────────────────────

async function enterLocation(stagehand, page, recorder, location) {
  console.log("🎯 STEP 1: Enter location...");
  await observeAndAct(stagehand, page, recorder,
    `Type "${location}" into the task location input field`,
    "Enter location"
  );
  await page.waitForTimeout(CFG.waits.step);

  // Select first autocomplete suggestion
  try {
    await observeAndAct(stagehand, page, recorder,
      "Click the first location autocomplete suggestion",
      "Select location suggestion"
    );
  } catch (e) {}
  await page.waitForTimeout(1000);

  await observeAndAct(stagehand, page, recorder,
    "Click the Continue button",
    "Continue past location"
  );
  await page.waitForTimeout(CFG.waits.step);
  console.log("   ✅ Location set");
}

async function selectItemType(stagehand, page, recorder) {
  console.log("🎯 STEP 2: Select item type...");
  await observeAndAct(stagehand, page, recorder,
    'Click "Other furniture items (non-IKEA)"',
    "Select non-IKEA furniture"
  );
  await page.waitForTimeout(1000);
  await observeAndAct(stagehand, page, recorder,
    "Click the Continue button",
    "Continue past item type"
  );
  await page.waitForTimeout(CFG.waits.step);
  console.log("   ✅ Item type selected");
}

async function selectTaskSize(stagehand, page, recorder) {
  console.log("🎯 STEP 3: Select task size...");
  await observeAndAct(stagehand, page, recorder,
    'Click "Small - Est. 1 hr"',
    "Select small task size"
  );
  await page.waitForTimeout(1000);
  await observeAndAct(stagehand, page, recorder,
    "Click the Continue button",
    "Continue past task size"
  );
  await page.waitForTimeout(CFG.waits.step);
  console.log("   ✅ Task size selected");
}

async function extractTaskers(stagehand, page, recorder) {
  console.log(`🎯 STEP 4: Extract up to ${CFG.maxResults} taskers...\n`);
  const { z } = require("zod/v3");

  const data = await stagehand.extract(
    `Extract up to ${CFG.maxResults} taskers from the recommendations page. For each tasker, get their name, hourly rate, rating, and number of completed tasks.`,
    z.object({
      taskers: z.array(z.object({
        name: z.string().describe("Tasker name (e.g. 'Hamza B.')"),
        hourly_rate: z.string().describe("Hourly rate (e.g. '$77.68/hr')"),
        rating: z.string().describe("Rating (e.g. '5.0')"),
        tasks_completed: z.string().describe("Number of completed tasks"),
      })).describe(`Up to ${CFG.maxResults} taskers`),
    })
  );

  recorder.record("extract", {
    instruction: "Extract tasker recommendations",
    description: `Extract up to ${CFG.maxResults} taskers`,
    results: data,
  });

  console.log(`📋 Found ${data.taskers.length} taskers:`);
  data.taskers.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.name}`);
    console.log(`      Rate: ${t.hourly_rate}  Rating: ${t.rating}  Tasks: ${t.tasks_completed}`);
  });

  return data;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  TaskRabbit – Tasker Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  🔧 Service: ${CFG.serviceType}`);
  console.log(`  📍 Location: ${CFG.location}\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: { headless: false, viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars"] },
    });
    await stagehand.init();

    const page = stagehand.context.pages()[0];
    recorder.goto(CFG.bookUrl);
    await page.goto(CFG.bookUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    await enterLocation(stagehand, page, recorder, CFG.location);
    await selectItemType(stagehand, page, recorder);
    await selectTaskSize(stagehand, page, recorder);

    // Navigate to recommendations
    if (!page.url().includes("recommendations")) {
      const recUrl = page.url().replace("/details", "/recommendations");
      await page.goto(recUrl);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(CFG.waits.load);
    }

    const data = await extractTaskers(stagehand, page, recorder);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${data.taskers.length} taskers found`);
    console.log("═══════════════════════════════════════════════════════════");

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return data;
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

main().catch(console.error);
