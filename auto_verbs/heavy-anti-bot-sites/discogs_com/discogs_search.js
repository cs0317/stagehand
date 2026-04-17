/**
 * Discogs – Music Release Search
 *
 * Prompt:
 *   Search for music releases matching "Dark Side of the Moon".
 *   Extract up to 5 results with release title, artist, format, year, and label.
 *
 * Strategy:
 *   Direct URL: discogs.com/search/?q=<query>&type=all
 *   Then use Stagehand extract to pull release details.
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
  query: "Dark Side of the Moon",
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
    // ── Navigate to Discogs search ───────────────────────────
    const url = `https://www.discogs.com/search/?q=${encodeURIComponent(CFG.query)}&type=all`;
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
      
      // Look for search result cards
      const cards = document.querySelectorAll('[data-object-type], .card, .search_result_card, [class*="searchResult"]');
      info.cardSelector = cards.length;
      info.firstCardSample = cards.length > 0 ? {
        tag: cards[0].tagName,
        className: cards[0].className.substring(0, 200),
        id: cards[0].id,
        dataType: cards[0].getAttribute('data-object-type'),
      } : null;

      // Check for release links
      const releaseLinks = document.querySelectorAll('a[href*="/release/"]');
      info.releaseLinksCount = releaseLinks.length;
      info.firstReleaseLinks = Array.from(releaseLinks).slice(0, 3).map(a => ({
        href: a.getAttribute('href'),
        text: a.textContent.trim().substring(0, 100),
        ariaLabel: a.getAttribute('aria-label'),
      }));

      // Check for list items in search results
      const listItems = document.querySelectorAll('#search_results li, .search_results li, [id*="search"] li');
      info.listItemsCount = listItems.length;

      // Get first card full structure
      if (cards.length > 0) {
        const card = cards[0];
        const allText = card.innerText.trim();
        info.firstCardText = allText.substring(0, 500);

        // Get all links inside first card
        const links = card.querySelectorAll('a');
        info.firstCardLinks = Array.from(links).slice(0, 8).map(a => ({
          href: a.getAttribute('href') || '',
          text: a.textContent.trim().substring(0, 80),
        }));
      }

      return info;
    });

    console.log("\n════ DOM STRUCTURE ════");
    console.log(`Card elements found: ${domInfo.cardSelector}`);
    console.log(`Release links count: ${domInfo.releaseLinksCount}`);
    console.log(`List items count: ${domInfo.listItemsCount}`);
    if (domInfo.firstCardSample) {
      console.log(`First card: <${domInfo.firstCardSample.tag}> class="${domInfo.firstCardSample.className}" data-object-type="${domInfo.firstCardSample.dataType}"`);
    }
    if (domInfo.firstReleaseLinks) {
      console.log("\nFirst release links:");
      domInfo.firstReleaseLinks.forEach((l, i) => {
        console.log(`  ${i}: "${l.text}" → ${l.href}`);
      });
    }
    if (domInfo.firstCardText) {
      console.log(`\nFirst card text:\n${domInfo.firstCardText}`);
    }
    if (domInfo.firstCardLinks) {
      console.log("\nFirst card links:");
      domInfo.firstCardLinks.forEach((l, i) => {
        console.log(`  ${i}: "${l.text}" → ${l.href}`);
      });
    }

    // ── extractAriaScopeForXPath on first few release links ──
    if (domInfo.firstReleaseLinks && domInfo.firstReleaseLinks.length > 0) {
      console.log("\n════ extractAriaScopeForXPath — RELEASE LINKS ════");
      for (const link of domInfo.firstReleaseLinks.slice(0, 2)) {
        const xpath = await page.evaluate((href) => {
          const el = document.querySelector(`a[href="${href}"]`);
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
        }, link.href);
        if (xpath) {
          const scope = await extractAriaScopeForXPath(page, xpath);
          console.log(`\n  Link: "${link.text}" → ${link.href}`);
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
    console.log(`\n🎯 Extracting up to ${CFG.maxItems} releases...`);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} music release results from this Discogs search page. For each release get: title, artist, format (e.g., Vinyl, CD, Cassette), year, and label.`,
      z.object({
        releases: z.array(z.object({
          title: z.string(),
          artist: z.string(),
          format: z.string(),
          year: z.string(),
          label: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${data.releases.length} releases:`);
    data.releases.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title}`);
      console.log(`     Artist: ${r.artist}  Format: ${r.format}  Year: ${r.year}  Label: ${r.label}`);
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
