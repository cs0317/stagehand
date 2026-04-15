const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * CNN.com – Tech Headlines
 *
 * Uses AI-driven discovery to navigate to the CNN Tech section
 * and extract top headlines with links.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.cnn.com/business/tech",
  section: "Tech",
  maxResults: 5,
  waits: { page: 3000, type: 2000 },
};

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    llmClient,
  });
  await stagehand.init();

  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];

  try {
    // ── Navigate to CNN Tech ─────────────────────────────────────────
    console.log(`\n── Navigating to ${CFG.url} ──`);
    await page.goto(CFG.url);
    recorder.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    // ── Extract headlines ────────────────────────────────────────────
    console.log(`\n── Extracting top ${CFG.maxResults} ${CFG.section} headlines ──`);

    const { z } = require("zod/v3");
    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} tech article headlines on this page. For each, get the title text and the article link URL.`,
      z.object({
        headlines: z.array(
          z.object({
            title: z.string(),
            link: z.string().url(),
          })
        ),
      })
    );

    console.log(`\n── Results ──`);
    if (data.headlines && data.headlines.length > 0) {
      data.headlines.forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.title}`);
        console.log(`     Link: ${h.link}`);
      });
    } else {
      console.log("  No headlines found.");
    }

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
