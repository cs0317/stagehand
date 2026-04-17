/**
 * Fiverr – Freelance Service Search
 *
 * Prompt:
 *   Search for freelance services related to "logo design".
 *   Extract up to 5 listings with seller name, service title, starting price, rating, and reviews.
 *
 * Strategy:
 *   Direct URL: fiverr.com/search/gigs?query=<query>
 *   Then use Stagehand extract.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

const CFG = {
  query: "logo design",
  maxItems: 5,
};

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
    const url = `https://www.fiverr.com/search/gigs?query=${encodeURIComponent(CFG.query)}`;
    console.log(`🌐 Navigating to: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied") || bodyText.includes("Cloudflare") || bodyText.length < 100) {
      console.log("🚫 Bot detection triggered. Stopping.");
      process.exit(1);
    }

    // DOM exploration
    console.log("\n🔍 Exploring DOM structure...");
    const domInfo = await page.evaluate(() => {
      const info = {};
      const cards = document.querySelectorAll('[class*="gig-card"], [class*="GigCard"], [data-testid*="gig"]');
      info.cardCount = cards.length;

      const links = document.querySelectorAll('a[href*="/gig/"], a[href*="gig"]');
      info.gigLinkCount = links.length;
      info.firstGigLinks = Array.from(links).slice(0, 3).map(a => ({
        href: a.getAttribute("href") || "",
        text: a.textContent.trim().substring(0, 150),
        ariaLabel: a.getAttribute("aria-label") || "",
      }));

      // Look for article elements or list items
      const articles = document.querySelectorAll("article, [role='article']");
      info.articleCount = articles.length;
      info.firstArticles = Array.from(articles).slice(0, 2).map(el => ({
        tag: el.tagName,
        className: el.className.substring(0, 100),
        text: el.innerText.trim().substring(0, 400),
      }));

      return info;
    });

    console.log(`Cards: ${domInfo.cardCount}, Gig links: ${domInfo.gigLinkCount}, Articles: ${domInfo.articleCount}`);
    domInfo.firstGigLinks?.forEach((l, i) => {
      console.log(`  GigLink[${i}]: "${l.text.substring(0, 80)}" aria="${l.ariaLabel}" → ${l.href.substring(0, 80)}`);
    });
    domInfo.firstArticles?.forEach((a, i) => {
      console.log(`\n  Article[${i}]: <${a.tag}> class="${a.className}"`);
      console.log(`    Text: ${a.text.substring(0, 300)}`);
    });

    // Extract using Stagehand
    console.log(`\n🎯 Extracting up to ${CFG.maxItems} service listings...`);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} freelance service listings from this Fiverr search page. For each get: seller name, service title, starting price, rating (star score), and number of reviews.`,
      z.object({
        listings: z.array(z.object({
          seller_name: z.string(),
          service_title: z.string(),
          starting_price: z.string(),
          rating: z.string(),
          reviews: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${data.listings.length} listings:`);
    data.listings.forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.service_title}`);
      console.log(`     Seller: ${l.seller_name}  Price: ${l.starting_price}  Rating: ${l.rating}  Reviews: ${l.reviews}`);
    });

    const actionsPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`\n📋 Recorded actions: ${actionsPath}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
