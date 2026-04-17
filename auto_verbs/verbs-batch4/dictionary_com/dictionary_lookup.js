/**
 * Dictionary.com – Word Lookup
 *
 * Prompt:
 *   Search for the word "ephemeral".
 *   Extract the word, pronunciation, part of speech, primary definition,
 *   example sentence, and up to 3 synonyms.
 *
 * Strategy:
 *   Direct URL: dictionary.com/browse/<word>
 *   Then use Stagehand extract to pull word details.
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
  word: "ephemeral",
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
    // ── Navigate to Dictionary.com word page ─────────────────
    const url = `https://www.dictionary.com/browse/${CFG.word}`;
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

    // ── DOM exploration: find key elements via XPath ─────────
    console.log("\n🔍 Exploring DOM structure...");
    const domInfo = await page.evaluate(() => {
      const info = {};

      // Pronunciation
      const pronEls = document.querySelectorAll('[class*="pron"], span.pron-spell-content');
      info.pronunciationSelectors = Array.from(pronEls).slice(0, 3).map(el => ({
        tag: el.tagName,
        className: el.className,
        text: el.textContent.trim().substring(0, 100),
      }));

      // Part of speech
      const posEls = document.querySelectorAll('[class*="pos"], .luna-pos');
      info.posSelectors = Array.from(posEls).slice(0, 3).map(el => ({
        tag: el.tagName,
        className: el.className,
        text: el.textContent.trim().substring(0, 100),
      }));

      // Definitions
      const defEls = document.querySelectorAll('[class*="def-content"], [class*="definition"]');
      info.definitionSelectors = Array.from(defEls).slice(0, 3).map(el => ({
        tag: el.tagName,
        className: el.className,
        text: el.textContent.trim().substring(0, 200),
      }));

      // Example sentences
      const exEls = document.querySelectorAll('[class*="example"], [class*="luna-example"]');
      info.exampleSelectors = Array.from(exEls).slice(0, 3).map(el => ({
        tag: el.tagName,
        className: el.className,
        text: el.textContent.trim().substring(0, 200),
      }));

      // Synonyms
      const synEls = document.querySelectorAll('[class*="synonym"] a, [data-type="synonym"] a');
      info.synonymSelectors = Array.from(synEls).slice(0, 5).map(el => ({
        tag: el.tagName,
        text: el.textContent.trim(),
        href: el.getAttribute("href") || "",
      }));

      return info;
    });

    console.log("\n════ DOM STRUCTURE ════");
    console.log("Pronunciation elements:", JSON.stringify(domInfo.pronunciationSelectors, null, 2));
    console.log("Part of speech elements:", JSON.stringify(domInfo.posSelectors, null, 2));
    console.log("Definition elements:", JSON.stringify(domInfo.definitionSelectors, null, 2));
    console.log("Example elements:", JSON.stringify(domInfo.exampleSelectors, null, 2));
    console.log("Synonym elements:", JSON.stringify(domInfo.synonymSelectors, null, 2));

    // ── Extract using Stagehand ──────────────────────────────
    console.log(`\n🎯 Extracting word details for "${CFG.word}"...`);

    const data = await stagehand.extract(
      `Extract the word definition details from this Dictionary.com page. Get: the word itself, its phonetic pronunciation, part of speech (e.g., adjective, noun), the primary definition, an example sentence, and up to 3 synonyms.`,
      z.object({
        word: z.string(),
        pronunciation: z.string(),
        part_of_speech: z.string(),
        primary_definition: z.string(),
        example_sentence: z.string(),
        synonyms: z.array(z.string()),
      })
    );

    console.log(`\n✅ Extracted word details:`);
    console.log(`  Word: ${data.word}`);
    console.log(`  Pronunciation: ${data.pronunciation}`);
    console.log(`  Part of speech: ${data.part_of_speech}`);
    console.log(`  Definition: ${data.primary_definition}`);
    console.log(`  Example: ${data.example_sentence}`);
    console.log(`  Synonyms: ${data.synonyms.join(", ")}`);

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
