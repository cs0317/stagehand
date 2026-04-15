const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct, extractAriaScopeForXPath } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Angi.com – Home Service Professional Search
 *
 * Uses AI-driven discovery to search Angi.com for home service professionals.
 * Angi's homepage search leads to a service-request wizard, so instead we
 * navigate to the company directory at /companylist/ which shows rated pros.
 * Records interactions and generates a Python Playwright script.
 * Does not take any screenshots.
 */

// ── Hard kill switch ─────────────────────────────────────────────────────────
const GLOBAL_TIMEOUT_MS = 150_000;
const _killTimer = setTimeout(() => {
  console.error("\n⏱️  Global timeout reached — force-exiting.");
  process.exit(2);
}, GLOBAL_TIMEOUT_MS);
_killTimer.unref();

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.angi.com/companylist/phoenix/plumbing.htm",
  service_type: "plumber",
  location: "Phoenix, AZ",
  maxResults: 5,
  waits: { page: 4000, type: 1500, search: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder, extractCode) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;

  const defaultExtract = `        # ── Extract professionals ─────────────────────────────────────
        print(f"Extracting up to {max_results} professionals...")

        # Try to find professional cards on the directory page
        cards = page.locator(
            "[data-testid*='provider'], "
            "[data-testid*='result'], "
            "div[role='listitem'], "
            "article"
        )
        count = cards.count()
        print(f"  Found {count} result cards")

        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                name = "N/A"
                try:
                    name_el = card.locator("h2, h3, h4, a[data-testid], [data-testid*='name']").first
                    name = name_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                rating = "N/A"
                try:
                    rating_el = card.locator("[aria-label*='star'], [aria-label*='rating'], [data-testid*='rating']").first
                    rating = rating_el.get_attribute("aria-label") or rating_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                reviews = "N/A"
                try:
                    reviews_el = card.locator("span:has-text('review'), [data-testid*='review']").first
                    reviews = reviews_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                services = "N/A"
                try:
                    services_el = card.locator("[data-testid*='service'], [class*='category']").first
                    services = services_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                if name != "N/A":
                    results.append({
                        "name": name,
                        "rating": rating,
                        "reviews": reviews,
                        "services": services,
                    })
            except Exception:
                continue

        # Fallback: parse page text for professional-like entries
        if not results:
            print("  Card extraction failed, trying text fallback...")
            body_text = page.evaluate("document.body.innerText") or ""
            lines = [l.strip() for l in body_text.split("\\n") if l.strip()]
            i = 0
            while i < len(lines) and len(results) < max_results:
                line = lines[i]
                if re.search(r'\\b\\d\\.\\d\\b', line) and ("review" in line.lower() or "rating" in line.lower()):
                    name = lines[i - 1] if i > 0 else "N/A"
                    results.append({
                        "name": name,
                        "rating": line,
                        "reviews": "N/A",
                        "services": "N/A",
                    })
                i += 1`;

  return `"""
Auto-generated Playwright script (Python)
Angi.com – Home Service Professional Search
Service: "${cfg.service_type}" near "${cfg.location}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import os, sys, shutil, re, traceback
from urllib.parse import quote
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def build_angi_url(service_type: str, location: str) -> str:
    """Build Angi company directory URL from service and location."""
    city = location.split(",")[0].strip().lower().replace(" ", "-")
    svc_map = {
        "plumber": "plumbing", "electrician": "electricians",
        "painter": "painting", "roofer": "roofing",
        "landscaper": "landscaping", "carpenter": "carpentry",
        "handyman": "handyman", "hvac": "heating-and-air-conditioning",
        "cleaner": "house-cleaning", "mover": "movers",
    }
    svc = svc_map.get(service_type.lower(), service_type.lower())
    return f"https://www.angi.com/companylist/{city}/{svc}.htm"


def run(
    playwright: Playwright,
    service_type: str = "${cfg.service_type}",
    location: str = "${cfg.location}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print("=" * 59)
    print("  Angi.com – Home Service Professional Search")
    print("=" * 59)
    print(f'  Service: "{service_type}" near "{location}"\\n')

    port = get_free_port()
    profile_dir = get_temp_profile_dir("angi_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to Angi directory page ───────────────────────────
        url = build_angi_url(service_type, location)
        print(f"Loading: {url}")
        page.goto(url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── Dismiss popups / cookie banners ───────────────────────────
        for sel in [
            "#onetrust-accept-btn-handler",
            "button:has-text('Accept')",
            "button:has-text('Got it')",
            "button:has-text('No, thanks')",
            "[data-testid='close-button']",
            "button[aria-label='Close']",
        ]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

${extractCode || defaultExtract}

        # ── Print results ─────────────────────────────────────────────
        print(f"\\nFound {len(results)} professionals for '{service_type}' near '{location}':")
        for i, pro in enumerate(results, 1):
            print(f"  {i}. {pro['name']}")
            print(f"     Rating: {pro['rating']}  Reviews: {pro['reviews']}")
            print(f"     Services: {pro['services']}")

    except Exception as e:
        print(f"\\nError: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\\nTotal professionals found: {len(items)}")
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function dismissPopups(page) {
  console.log("🔲 Dismissing popups...");
  const selectors = [
    "#onetrust-accept-btn-handler",
    "button:has-text('Accept')",
    "button:has-text('Got it')",
    "button:has-text('No, thanks')",
    "[data-testid='close-button']",
    "button[aria-label='Close']",
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        console.log(`   ✅ Dismissed: ${sel}`);
        await page.waitForTimeout(500);
      }
    } catch (e) { /* not visible */ }
  }
  await page.waitForTimeout(500);
}

async function navigateToDirectory(stagehand, page, recorder) {
  console.log(`🔍 Loading Angi directory for "${CFG.service_type}" near "${CFG.location}"...`);

  const url = CFG.url;
  recorder.goto(url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  recorder.wait(CFG.waits.page, "Wait for Angi directory");
  await page.waitForTimeout(CFG.waits.page);
  console.log(`   ✅ Loaded: ${page.url()}`);

  await dismissPopups(page);
}

async function exploreProfessionalCards(stagehand, page, recorder) {
  console.log("🔍 Exploring page structure for professional cards...");

  const currentUrl = page.url();
  console.log(`   Current URL: ${currentUrl}`);

  // Check if we landed on a directory page or got redirected
  if (currentUrl.includes("request.angi.com") || currentUrl.includes("service-request")) {
    console.log("   ⚠️  Redirected to service request page — Angi may not have a public directory for this.");
    return { professionals: [], extractCode: null };
  }

  // First, try to find card-like elements to understand the page structure
  const selectorTests = [
    "[data-testid]",
    "article",
    "div[role='listitem']",
    "li[role='listitem']",
  ];
  for (const sel of selectorTests) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`   Found ${count} elements with: ${sel}`);
        // Get first element's ARIA info
        const first = page.locator(sel).first();
        const tagInfo = await first.evaluate(el => ({
          tag: el.tagName,
          id: el.id,
          testid: el.getAttribute("data-testid"),
          role: el.getAttribute("role"),
          ariaLabel: el.getAttribute("aria-label"),
          className: el.className?.substring?.(0, 80),
          textSnippet: el.textContent?.substring?.(0, 100),
        }));
        console.log(`   First element: ${JSON.stringify(tagInfo)}`);
      }
    } catch (e) { /* not found */ }
  }

  // Use AI to extract professionals
  try {
    console.log("   Attempting AI extraction...");
    const data = await stagehand.extract(
      `Extract up to ${CFG.maxResults} home service professionals/companies listed on this page. For each, get: company name, star rating (number), number of reviews, and services or specialties they offer. If no professional listings are visible, return an empty array.`,
      {
        professionals: [{
          name: "string",
          rating: "string",
          reviews: "string",
          services: "string",
        }],
      }
    );
    console.log(`   ✅ AI extracted ${data.professionals?.length || 0} professionals`);
    return { professionals: data.professionals || [], extractCode: null };
  } catch (e) {
    console.log(`   ⚠️  AI extraction failed: ${e.message}`);
    return { professionals: [], extractCode: null };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  let stagehand;
  try {
    const llmClient = setupLLMClient();
    stagehand = new Stagehand({
      env: "LOCAL",
      verbose: 0,
      llmClient,
      localBrowserLaunchOptions: {
        headless: false,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-infobars",
          "--start-maximized",
        ],
      },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];
    const recorder = new PlaywrightRecorder();

    await navigateToDirectory(stagehand, page, recorder);

    // Explore the page and extract
    const { professionals, extractCode } = await exploreProfessionalCards(stagehand, page, recorder);

    // Print results
    console.log("\n" + "=".repeat(59));
    console.log("  Results");
    console.log("=".repeat(59));
    if (professionals && professionals.length > 0) {
      for (let i = 0; i < professionals.length; i++) {
        const p = professionals[i];
        console.log(`  ${i + 1}. ${p.name}`);
        console.log(`     Rating: ${p.rating}  Reviews: ${p.reviews}`);
        console.log(`     Services: ${p.services}`);
      }
    } else {
      console.log("  No professionals found.");
    }

    // Save Python script
    const pyCode = genPython(CFG, recorder, extractCode);
    const outDir = path.join(__dirname);
    fs.writeFileSync(path.join(outDir, "angi_search.py"), pyCode);
    console.log(`\n💾 Saved: angi_search.py`);

    // Save recorded actions
    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log("💾 Saved: recorded_actions.json");

  } catch (err) {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  } finally {
    clearTimeout(_killTimer);
    if (stagehand) {
      try { await stagehand.close(); } catch (_) {}
    }
    process.exit(0);
  }
})();
