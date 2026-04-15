/**
 * _explore.js — Whole Foods Market exploration script
 *
 * KEY FINDINGS from exploration (2026-04-15):
 *
 * 1. WFM search URL: https://www.wholefoodsmarket.com/search?text={query}
 *    → redirects to https://www.wholefoodsmarket.com/grocery/search?k={query}
 *
 * 2. The grocery search page (/grocery/search?k=) is powered by Amazon Fresh.
 *    Products ONLY load when the user is signed in to Amazon (Amazon login required).
 *    Without auth: "Loading page content, please wait..." persists indefinitely.
 *
 * 3. The WFM storefront (https://www.wholefoodsmarket.com/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz)
 *    DOES show deal products without auth, but has no product search capability.
 *
 * 4. Stable selectors:
 *    - Search box:  [data-testid="search-input"]   (both desktop + mobile versions present)
 *    - Store locator input:  input#store-finder-search-bar
 *      (at https://www.wholefoodsmarket.com/stores)
 *    - Login prompt indicator: [data-testid="login-prompt"]
 *
 * 5. When signed in + store set, search results load at /grocery/search?k=...
 *    Products are rendered by a Next.js/React app.
 *    Body text format per product (from storefront deals page):
 *      {discount%}\nJoin Prime to buy this item at {price}\n{product name}\n{product name}\n{size}
 *    Authenticated search page text per product (inferred):
 *      {product name}\n{size}\n{price}
 *
 * 6. The Python script uses cdp_utils to launch Chrome with the user's profile.
 *    On Windows, this copies from LOCALAPPDATA/Google/Chrome/User Data/Default.
 *    Amazon login requires the Cookies file to be present (not just Preferences).
 *    The verb therefore works best when the user's Chrome profile is NOT running
 *    and we copy their full profile directory.
 *
 * Usage:  node _explore.js   (requires playwright npm package)
 */

const { chromium } = require("playwright");
const path = require("path");
const os = require("os");
const fs = require("fs");

const CFG = {
  url: "https://www.wholefoodsmarket.com",
  query: "organic coffee",
  maxResults: 5,
};

(async () => {
  const profileDir = path.join(os.tmpdir(), "wfm_explore_profile");
  fs.mkdirSync(profileDir, { recursive: true });

  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 900 },
  });

  const page = browser.pages()[0] || (await browser.newPage());

  try {
    // ── Navigate ──────────────────────────────────────────────────────────
    console.log(`\nLoading ${CFG.url} …`);
    await page.goto(CFG.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log(`  URL: ${page.url()}`);
    console.log(`  Title: ${await page.title()}`);

    // ── Try direct search URL ─────────────────────────────────────────────
    const searchUrl = `${CFG.url}/search?text=${encodeURIComponent(CFG.query)}`;
    console.log(`\nNavigating directly to search URL: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);
    console.log(`  URL after search nav: ${page.url()}`);
    console.log(`  Title: ${await page.title()}`);

    // ── Dump first product card HTML ──────────────────────────────────────
    console.log("\n── Dumping candidate product card selectors ──");

    const candidateSelectors = [
      '[data-testid="product-tile"]',
      '[data-testid="grid-product-tile"]',
      '[class*="ProductCard"]',
      '[class*="product-card"]',
      '[class*="ProductTile"]',
      '[class*="product-tile"]',
      'article[class*="product"]',
      'li[class*="product"]',
      '[class*="w-pie--product"]',
      '[class*="wfm-product"]',
    ];

    for (const sel of candidateSelectors) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) {
          console.log(`  ✅ "${sel}" → ${count} elements`);
          // Dump inner HTML of first card
          const html = await page.locator(sel).first().innerHTML({ timeout: 3000 });
          console.log(`     First card HTML (first 800 chars):\n${html.slice(0, 800)}\n`);
        } else {
          console.log(`  ✗  "${sel}" → 0 elements`);
        }
      } catch (e) {
        console.log(`  !  "${sel}" → error: ${e.message}`);
      }
    }

    // ── Dump body text sample ─────────────────────────────────────────────
    console.log("\n── Page body text (first 2000 chars) ──");
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log(bodyText.slice(0, 2000));

    // ── Try interacting with search box if direct URL didn't work ─────────
    if (!page.url().includes("search")) {
      console.log("\nDirect URL failed, trying search box interaction...");
      await page.goto(CFG.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);

      const searchBoxCandidates = [
        'input[type="search"]',
        'input[placeholder*="search" i]',
        'input[aria-label*="search" i]',
        '[data-testid="search-input"]',
        'input[name="search"]',
        'input[name="text"]',
        '#search-bar-input',
      ];

      for (const sel of searchBoxCandidates) {
        try {
          const el = page.locator(sel).first();
          const visible = await el.isVisible({ timeout: 2000 });
          if (visible) {
            console.log(`  Found search box: "${sel}"`);
            await el.click();
            await page.waitForTimeout(500);
            await page.keyboard.press("Control+a");
            await el.type(CFG.query, { delay: 50 });
            await page.waitForTimeout(1000);
            await page.keyboard.press("Enter");
            await page.waitForTimeout(4000);
            console.log(`  URL after search: ${page.url()}`);
            break;
          }
        } catch (e) {
          // continue
        }
      }
    }

    // ── Second pass at product cards ──────────────────────────────────────
    console.log("\n── Second pass product card check ──");
    for (const sel of candidateSelectors) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) {
          console.log(`  ✅ "${sel}" → ${count} elements`);
          const html = await page.locator(sel).first().innerHTML({ timeout: 3000 });
          console.log(`     First card HTML (first 1000 chars):\n${html.slice(0, 1000)}\n`);
          break; // stop after first hit
        }
      } catch (e) {
        // ignore
      }
    }

    // ── Try extracting name/price/size from first hit ─────────────────────
    console.log("\n── Attempting extraction ──");
    const nameCandidates = [
      'h2[class*="title"]', 'h3[class*="title"]',
      '[data-testid="product-title"]',
      '[class*="ProductTitle"]',
      '[class*="product-name"]',
      'span[class*="title"]',
      'a[class*="title"]',
    ];
    for (const sel of nameCandidates) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) {
          const text = await page.locator(sel).first().innerText({ timeout: 2000 });
          console.log(`  Name selector "${sel}" → "${text.slice(0, 80)}"`);
        }
      } catch (e) { /* ignore */ }
    }

    const priceCandidates = [
      '[data-testid="product-price"]',
      '[class*="price"]',
      'span[class*="Price"]',
    ];
    for (const sel of priceCandidates) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) {
          const text = await page.locator(sel).first().innerText({ timeout: 2000 });
          console.log(`  Price selector "${sel}" → "${text.slice(0, 80)}"`);
          break;
        }
      } catch (e) { /* ignore */ }
    }

  } catch (err) {
    console.error("Fatal error:", err.message);
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
})();
