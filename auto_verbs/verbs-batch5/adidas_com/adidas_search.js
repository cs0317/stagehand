const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * adidas.com – Product Search
 *
 * Uses AI-driven discovery to search adidas.com for products,
 * records interactions and generates a Python Playwright script.
 * Does not take any screenshots.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.adidas.com",
  searchTerm: "running shoes",
  maxResults: 5,
  waits: { page: 10000, type: 2000, search: 8000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
adidas.com – Product Search
Search: ${cfg.searchTerm}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import Playwright, sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class AdidasSearchRequest:
    search_term: str = "${cfg.searchTerm}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class AdidasProduct:
    product_name: str = ""
    price: str = ""
    color: str = ""
    rating: str = ""
    num_reviews: str = ""
    url: str = ""


@dataclass(frozen=True)
class AdidasSearchResult:
    products: list = None  # list[AdidasProduct]


def adidas_search(page: Page, request: AdidasSearchRequest) -> AdidasSearchResult:
    """Search adidas.com for products matching a search term and extract
    product name, price, color, rating, and number of reviews."""
    search_term = request.search_term
    max_results = request.max_results
    print(f"  Search term: {search_term}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate to search results ────────────────────────────────────
    search_url = f"https://www.adidas.com/us/search?q={search_term.replace(' ', '+')}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to adidas search")
    page.goto(search_url, wait_until="domcontentloaded")

    # Wait for product cards (article elements) to appear
    try:
        page.locator("article").first.wait_for(state="attached", timeout=15000)
    except Exception:
        pass

    # Dismiss loading screen overlay
    try:
        page.locator('[data-auto-id="loading-screen"]').wait_for(state="hidden", timeout=8000)
    except Exception:
        pass
    page.wait_for_timeout(2000)
    print(f"  Loaded: {page.url}")

    # ── Dismiss cookie / consent banners ──────────────────────────────
    for selector in [
        "button#onetrust-accept-btn-handler",
        'button:has-text("Accept")',
        'button:has-text("Accept All Cookies")',
    ]:
        try:
            btn = page.locator(selector).first
            if btn.is_visible(timeout=1500):
                btn.evaluate("el => el.click()")
                page.wait_for_timeout(500)
                break
        except Exception:
            pass

    # ── Extract product listing data from article cards ───────────────
    checkpoint("Extract product listings from search results")
    articles = page.locator("main article")
    count = articles.count()
    print(f"  Found {count} product cards")

    price_re = re.compile(r"\\\\$[\\\\d,]+(?:\\\\.\\\\d{2})?")
    listing_data = []

    for i in range(min(count, max_results)):
        card = articles.nth(i)
        try:
            # Product name: from the first link's alt text or text content
            name = "N/A"
            try:
                img_el = card.locator("a img").first
                name = (img_el.get_attribute("alt") or "").strip()
            except Exception:
                pass
            if name == "N/A":
                try:
                    name = (card.locator("a").first.text_content(timeout=2000) or "").strip()
                except Exception:
                    pass

            # Product URL
            url = ""
            try:
                url = card.locator("a").first.get_attribute("href") or ""
                if url and not url.startswith("http"):
                    url = f"https://www.adidas.com{url}"
            except Exception:
                pass

            # Price: parse from card text
            price = "N/A"
            try:
                card_text = card.text_content(timeout=2000) or ""
                sale_match = re.search(r"Sale price\\\\s*(\\\\$[\\\\d,]+(?:\\\\.\\\\d{2})?)", card_text)
                if sale_match:
                    price = sale_match.group(1)
                else:
                    price_match = re.search(r"Price\\\\s*(\\\\$[\\\\d,]+(?:\\\\.\\\\d{2})?)", card_text)
                    if price_match:
                        price = price_match.group(1)
                    else:
                        m = price_re.search(card_text)
                        if m:
                            price = m.group(0)
            except Exception:
                pass

            # Colors: "N colors" from card text
            color = "N/A"
            try:
                color_match = re.search(r"(\\\\d+)\\\\s+colors?", card_text, re.IGNORECASE)
                if color_match:
                    color = f"{color_match.group(1)} colors"
            except Exception:
                pass

            if name == "N/A":
                continue
            listing_data.append((name, price, color, url))
        except Exception:
            continue

    print(f"  Collected {len(listing_data)} products from listing")

    # ── Visit each product detail page for rating & reviews ───────────
    results = []
    for idx, (name, price, color, url) in enumerate(listing_data):
        rating = "N/A"
        num_reviews = "N/A"
        if url:
            try:
                checkpoint(f"Visit product {idx + 1}: {name[:50]}")
                print(f"  Visiting product {idx + 1}: {url}")
                page.goto(url, wait_until="domcontentloaded")
                page.wait_for_timeout(2000)

                # Dismiss loading screen
                try:
                    page.locator('[data-auto-id="loading-screen"]').wait_for(
                        state="hidden", timeout=5000
                    )
                except Exception:
                    pass

                # Rating: data-auto-id="product-rating-review-count" → "4.6 (173)"
                try:
                    rating_el = page.locator(
                        '[data-auto-id="product-rating-review-count"]'
                    ).first
                    rating_text = rating_el.text_content(timeout=3000) or ""
                    rm = re.search(r"([\\\\d.]+)\\\\s*\\\\((\\\\d+)\\\\)", rating_text)
                    if rm:
                        rating = rm.group(1)
                        num_reviews = rm.group(2)
                except Exception:
                    pass

                # Fallback: star-rating class
                if rating == "N/A":
                    try:
                        star_el = page.locator('[class*="star-rating"]').first
                        star_text = star_el.text_content(timeout=2000) or ""
                        rm = re.search(r"([\\\\d.]+)", star_text)
                        if rm:
                            rating = rm.group(1)
                    except Exception:
                        pass

            except Exception as e:
                print(f"    Error visiting detail page: {e}")

        results.append(AdidasProduct(
            product_name=name,
            price=price,
            color=color,
            rating=rating,
            num_reviews=num_reviews,
            url=url,
        ))

    # ── Print results ─────────────────────────────────────────────────
    print("=" * 60)
    print(f'adidas - Search Results for "{search_term}"')
    print("=" * 60)
    for idx, p in enumerate(results, 1):
        print(f"\\n{idx}. {p.product_name}")
        print(f"   Price: {p.price}")
        print(f"   Color: {p.color}")
        print(f"   Rating: {p.rating}")
        print(f"   Reviews: {p.num_reviews}")
        print(f"   URL: {p.url}")

    print(f"\\nFound {len(results)} products")
    return AdidasSearchResult(products=results)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("adidas_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = adidas_search(page, AdidasSearchRequest())
            print(f"\\nReturned {len(result.products or [])} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function dismissPopups(page) {
  console.log("🔲 Dismissing popups / loading screen...");
  try {
    const loadingScreen = page.locator('[data-auto-id="loading-screen"]');
    await loadingScreen.waitFor({ state: "hidden", timeout: 10000 });
    console.log("   ✅ Loading screen dismissed");
  } catch (e) { /* no loading screen */ }

  try {
    const cookieBtn = page.locator("button#onetrust-accept-btn-handler");
    if (await cookieBtn.isVisible({ timeout: 2000 })) {
      await cookieBtn.click();
      console.log("   ✅ Accepted cookies");
      await page.waitForTimeout(500);
    }
  } catch (e) { /* no cookie banner */ }
}

async function extractProductListings(page, recorder) {
  console.log(`🎯 STEP 1: Extract up to ${CFG.maxResults} product listings...\n`);

  // Use page.evaluate() to extract data directly from the DOM — avoids CDP session issues
  const products = await page.evaluate((maxResults) => {
    const articles = document.querySelectorAll("main article");
    const results = [];
    for (let i = 0; i < Math.min(articles.length, maxResults); i++) {
      const card = articles[i];
      const cardText = card.textContent || "";

      // Name: from first img alt or first link text
      let name = "N/A";
      const img = card.querySelector("a img");
      if (img && img.alt) name = img.alt.trim();
      if (name === "N/A") {
        const link = card.querySelector("a");
        if (link) name = (link.textContent || "").trim().split("\n")[0].trim();
      }

      // URL: first link href
      let url = "";
      const link = card.querySelector("a[href]");
      if (link) {
        url = link.getAttribute("href") || "";
        if (url && !url.startsWith("http")) url = "https://www.adidas.com" + url;
      }

      // Price: look for sale price first, then regular price
      let price = "N/A";
      const saleMatch = cardText.match(/Sale price\s*(\$[\d,]+(?:\.\d{2})?)/);
      if (saleMatch) {
        price = saleMatch[1];
      } else {
        const priceMatch = cardText.match(/Price\s*(\$[\d,]+(?:\.\d{2})?)/);
        if (priceMatch) price = priceMatch[1];
        else {
          const dollarMatch = cardText.match(/\$[\d,]+(?:\.\d{2})?/);
          if (dollarMatch) price = dollarMatch[0];
        }
      }

      // Colors: "N colors" pattern
      let colors = "N/A";
      const colorMatch = cardText.match(/(\d+)\s+colors?/i);
      if (colorMatch) colors = colorMatch[1] + " colors";

      if (name !== "N/A") results.push({ name, price, colors, url });
    }
    return results;
  }, CFG.maxResults);

  recorder.record("extract", {
    instruction: "Extract product search results from listing page",
    description: `Extracted ${products.length} products via DOM queries`,
    results: { products },
  });

  console.log(`📋 Found ${products.length} products on listing page:`);
  products.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name} — ${p.price} — ${p.colors}`);
  });

  return { products };
}

async function extractProductRatings(page, recorder, products) {
  console.log(`\n🎯 STEP 2: Visit each product page for ratings & reviews...\n`);

  const enriched = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    let rating = "N/A";
    let numReviews = "N/A";

    if (p.url) {
      try {
        console.log(`   Visiting ${i + 1}/${products.length}: ${p.url}`);

        // Use window.location.assign inside page.evaluate to avoid Stagehand's
        // page.goto wrapper which can hang on adidas.com's heavy SPA.
        await page.evaluate((url) => { window.location.assign(url); }, p.url);

        // Wait for the detail page to load
        await page.waitForTimeout(8000);

        // Wait for loading screen to clear
        try {
          const ls = page.locator('[data-auto-id="loading-screen"]');
          await ls.waitFor({ state: "hidden", timeout: 8000 });
        } catch (e) {}

        // Extra settle time for SPA hydration
        await page.waitForTimeout(2000);

        // Extract rating via DOM: data-auto-id="product-rating-review-count" → "4.6 (173)"
        const ratingInfo = await page.evaluate(() => {
          const el = document.querySelector('[data-auto-id="product-rating-review-count"]');
          if (!el) return null;
          const text = el.textContent || "";
          const m = text.match(/([\d.]+)\s*\((\d+)\)/);
          if (m) return { rating: m[1], reviews: m[2] };
          return null;
        });

        if (ratingInfo) {
          rating = ratingInfo.rating;
          numReviews = ratingInfo.reviews;
          console.log(`      ⭐ Rating: ${rating} (${numReviews} reviews)`);
        } else {
          // Fallback: look for star-rating or review elements
          const fallback = await page.evaluate(() => {
            // Try star-rating class
            const starEl = document.querySelector('[class*="star-rating"], [class*="review"]');
            if (starEl) {
              const text = starEl.textContent || "";
              const m = text.match(/([\d.]+)/);
              if (m) return { rating: m[1], reviews: "N/A" };
            }
            return null;
          });
          if (fallback) {
            rating = fallback.rating;
            numReviews = fallback.reviews;
            console.log(`      ⭐ Rating (fallback): ${rating}`);
          } else {
            console.log(`      ⚠️  No rating found for ${p.name}`);
          }
        }

        recorder.record("extract", {
          instruction: `Extract rating from product detail: ${p.name}`,
          description: `Rating: ${rating}, Reviews: ${numReviews}`,
        });
      } catch (e) {
        console.log(`      ❌ Error visiting detail page: ${e.message}`);
      }
    }

    enriched.push({ ...p, rating, numReviews });
  }

  return enriched;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  adidas.com – Product Search");
  console.log("  🔍 AI-driven discovery + Playwright locators");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  🔎 Search: "${CFG.searchTerm}"`);
  console.log(`  📦 Max results: ${CFG.maxResults}\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    console.log("🎭 Initializing Stagehand...");
    stagehand = new Stagehand({
      env: "LOCAL",
      verbose: 0,
      llmClient,
      localBrowserLaunchOptions: {
        userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"),
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-infobars",
          "--disable-extensions",
          "--start-maximized",
          "--window-size=1920,1080",
        ],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    // Navigate directly to search results (skip homepage to avoid SPA load timeout)
    const searchUrl = `${CFG.url}/us/search?q=${encodeURIComponent(CFG.searchTerm)}`;
    console.log(`🌐 Loading ${searchUrl}...`);
    recorder.goto(searchUrl);
    try {
      await page.goto(searchUrl, { timeout: 60000, waitUntil: "domcontentloaded" });
    } catch (e) {
      console.log("   ⚠️  Navigation timeout (heavy SPA), continuing...");
    }
    // Let the SPA fully settle before interacting
    await page.waitForTimeout(10000);
    // Wait for article cards to appear (products loaded)
    try {
      await page.locator("article").first().waitFor({ state: "attached", timeout: 20000 });
      console.log("   ✅ Product cards detected");
    } catch (e) {
      console.log("   ⚠️  No article elements found yet, continuing...");
    }
    console.log("✅ Loaded\n");
    recorder.wait(CFG.waits.page, "Initial page load");
    await page.waitForTimeout(2000);

    await dismissPopups(page);

    const listings = await extractProductListings(page, recorder);
    const enriched = await extractProductRatings(page, recorder, listings.products);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${enriched.length} products found`);
    console.log("═══════════════════════════════════════════════════════════");
    enriched.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name}`);
      console.log(`     💰 ${p.price}  🎨 ${p.colors}  ⭐ ${p.rating} (${p.numReviews} reviews)`);
    });

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "adidas_search.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return enriched;

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "adidas_search.py"), pyScript, "utf-8");
      console.log("⚠️  Partial Python saved");
    }
    throw err;
  } finally {
    if (stagehand) {
      console.log("🧹 Closing...");
      await stagehand.close();
    }
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
