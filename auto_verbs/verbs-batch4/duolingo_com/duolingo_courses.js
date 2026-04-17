/**
 * Duolingo – Language Course Catalog
 *
 * Prompt:
 *   Navigate to the course catalog or language list page.
 *   Extract up to 10 available language courses with language name and number of learners.
 *
 * Strategy:
 *   Direct URL: duolingo.com/courses
 *   Then use Stagehand extract to pull course details.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

/* ── config ──────────────────────────────────────────────── */
const CFG = {
  maxItems: 10,
};

/* ── main ────────────────────────────────────────────────── */
(async () => {
  const llmClient = setupLLMClient("copilot");

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    },
  });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    // ── Navigate to Duolingo courses page ────────────────────
    const url = "https://www.duolingo.com/courses";
    console.log(`🌐 Navigating to: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check for bot detection ──────────────────────────────
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied")) {
      console.log("🚫 Bot detection triggered. Stopping.");
      process.exit(1);
    }

    // ── DOM exploration ──────────────────────────────────────
    console.log("\n🔍 Exploring DOM structure...");
    const domInfo = await page.evaluate(() => {
      const info = {};

      // Check for course cards/links
      const courseLinks = document.querySelectorAll('a[href*="/course/"]');
      info.courseLinksCount = courseLinks.length;
      info.firstCourseLinks = Array.from(courseLinks).slice(0, 5).map(a => ({
        href: a.getAttribute('href'),
        text: a.innerText.trim().substring(0, 200),
        ariaLabel: a.getAttribute('aria-label') || '',
      }));

      // Check for data-test attributes
      const dataTests = document.querySelectorAll('[data-test]');
      info.dataTestCount = dataTests.length;
      info.sampleDataTests = Array.from(dataTests).slice(0, 10).map(el => ({
        tag: el.tagName,
        dataTest: el.getAttribute('data-test'),
        text: el.textContent.trim().substring(0, 100),
      }));

      // Look for learner count patterns
      const allText = document.body.innerText;
      const learnerMatches = allText.match(/[\d.]+[MK]?\s*learner/gi);
      info.learnerPatterns = learnerMatches ? learnerMatches.slice(0, 5) : [];

      return info;
    });

    console.log("\n════ DOM STRUCTURE ════");
    console.log(`Course links: ${domInfo.courseLinksCount}`);
    console.log(`data-test elements: ${domInfo.dataTestCount}`);
    console.log(`Learner count patterns: ${JSON.stringify(domInfo.learnerPatterns)}`);

    if (domInfo.firstCourseLinks) {
      console.log("\nFirst course links:");
      domInfo.firstCourseLinks.forEach((l, i) => {
        console.log(`  ${i}: "${l.text}" aria="${l.ariaLabel}" → ${l.href}`);
      });
    }
    if (domInfo.sampleDataTests.length > 0) {
      console.log("\nSample data-test elements:");
      domInfo.sampleDataTests.forEach((el, i) => {
        console.log(`  ${i}: <${el.tag} data-test="${el.dataTest}"> "${el.text.substring(0, 60)}"`);
      });
    }

    // ── Extract using Stagehand ──────────────────────────────
    console.log(`\n🎯 Extracting up to ${CFG.maxItems} language courses...`);

    const data = await stagehand.extract(
      `Extract up to ${CFG.maxItems} available language courses from this Duolingo courses page. For each course get: the language name and the number of learners (e.g., "43.6M learners").`,
      z.object({
        courses: z.array(z.object({
          language: z.string(),
          learners: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${data.courses.length} courses:`);
    data.courses.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.language} — ${c.learners}`);
    });

    // ── Save recorded actions ────────────────────────────────
    const actionsPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`\n📋 Recorded actions: ${actionsPath}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
