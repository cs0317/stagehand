/**
 * Dribbble – Design Shots Search
 *
 * Prompt:
 *   Search for design shots matching "mobile app UI".
 *   Extract up to 5 shots with title, designer name, number of likes, and views.
 *
 * Strategy:
 *   Direct URL: dribbble.com/search/shots/popular?q=<query>
 *   Then use Stagehand extract to pull shot details.
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
  query: "mobile app UI",
  maxItems: 5,
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
    // ── Navigate to Dribbble search ──────────────────────────
    const url = `https://dribbble.com/search/shots/popular?q=${encodeURIComponent(CFG.query)}`;
    console.log(`🌐 Navigating to: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check for bot detection ──────────────────────────────
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied") || bodyText.includes("Cloudflare")) {
      console.log("🚫 Bot detection triggered. Stopping.");
      process.exit(1);
    }

    // ── DOM exploration ──────────────────────────────────────
    console.log("\n🔍 Exploring DOM structure...");
    const domInfo = await page.evaluate(() => {
      const info = {};

      // Look for shot cards
      const shotLis = document.querySelectorAll('li[id^="screenshot-"]');
      info.shotListItems = shotLis.length;

      // Alternative card selectors  
      const cards = document.querySelectorAll('[class*="shot-thumbnail"], [class*="Shot"], .js-shot-thumbnail-base');
      info.altCards = cards.length;

      // Check first few shot list items
      info.firstShots = Array.from(shotLis).slice(0, 3).map(li => {
        const links = li.querySelectorAll('a');
        const imgs = li.querySelectorAll('img');
        return {
          id: li.id,
          text: li.innerText.trim().substring(0, 300),
          linkCount: links.length,
          firstLinks: Array.from(links).slice(0, 5).map(a => ({
            href: a.getAttribute('href') || '',
            text: a.textContent.trim().substring(0, 80),
            ariaLabel: a.getAttribute('aria-label') || '',
          })),
          imgCount: imgs.length,
        };
      });

      // Check for any data-testid or role attributes
      const testIds = document.querySelectorAll('[data-testid]');
      info.dataTestIdCount = testIds.length;
      info.sampleTestIds = Array.from(testIds).slice(0, 5).map(el => el.getAttribute('data-testid'));

      return info;
    });

    console.log("\n════ DOM STRUCTURE ════");
    console.log(`Shot list items (li[id^="screenshot-"]): ${domInfo.shotListItems}`);
    console.log(`Alt card elements: ${domInfo.altCards}`);
    console.log(`data-testid elements: ${domInfo.dataTestIdCount}`);
    if (domInfo.sampleTestIds.length > 0) {
      console.log(`Sample data-testids: ${domInfo.sampleTestIds.join(', ')}`);
    }

    if (domInfo.firstShots) {
      domInfo.firstShots.forEach((shot, i) => {
        console.log(`\n--- Shot ${i} (${shot.id}) ---`);
        console.log(`  Text: ${shot.text}`);
        console.log(`  Links: ${shot.linkCount}, Images: ${shot.imgCount}`);
        shot.firstLinks.forEach((l, j) => {
          console.log(`    Link[${j}]: "${l.text}" aria="${l.ariaLabel}" → ${l.href}`);
        });
      });
    }

    // ── extractAriaScopeForXPath on first shot ───────────────
    if (domInfo.firstShots && domInfo.firstShots.length > 0) {
      const firstShot = domInfo.firstShots[0];
      if (firstShot.firstLinks.length > 0) {
        const href = firstShot.firstLinks[0].href;
        console.log("\n════ extractAriaScopeForXPath — FIRST SHOT LINK ════");
        const xpath = await page.evaluate((h) => {
          const el = document.querySelector(`a[href="${h}"]`);
          if (!el) return null;
          const parts = [];
          let node = el;
          while (node && node.nodeType === 1) {
            let idx = 1;
            let sib = node.previousElementSibling;
            while (sib) { if (sib.tagName === node.tagName) idx++; sib = sib.previousElementSibling; }
            parts.unshift(`${node.tagName.toLowerCase()}[${idx}]`);
            node = node.parentElement;
          }
          return "/" + parts.join("/");
        }, href);
        if (xpath) {
          const scope = await extractAriaScopeForXPath(page, xpath);
          console.log(`  Link: "${firstShot.firstLinks[0].text}" → ${href}`);
          if (scope && scope.ancestor) {
            const a = scope.ancestor;
            console.log(`  ARIA ancestor: <${a.tagName} id="${a.id}" aria-label="${a.ariaLabel}" role="${a.role}"> (${a.stepsFromTarget} up)`);
            console.log(`  textMatchCount=${scope.textMatchCount}  xpathTail=${scope.xpathTail}`);
          } else {
            console.log(`  No ARIA ancestor found`);
          }
        }
      }
    }

    // ── Extract using Stagehand ──────────────────────────────
    console.log(`\n🎯 Extracting up to ${CFG.maxItems} shots...`);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} design shot results from this Dribbble search page. For each shot get: title, designer name, number of likes, and number of views.`,
      z.object({
        shots: z.array(z.object({
          title: z.string(),
          designer_name: z.string(),
          likes: z.string(),
          views: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${data.shots.length} shots:`);
    data.shots.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.title}`);
      console.log(`     Designer: ${s.designer_name}  Likes: ${s.likes}  Views: ${s.views}`);
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
