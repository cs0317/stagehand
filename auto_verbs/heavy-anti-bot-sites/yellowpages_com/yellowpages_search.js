const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Yellow Pages – Business Search
 *
 * Search for a business type in a given location and extract listings
 * with business name, phone number, address, and rating.
 * Records interactions and generates a Python Playwright script.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.yellowpages.com",
  searchTerm: "plumber",
  location: "Chicago, IL",
  maxResults: 5,
  waits: { page: 3000, type: 1500, search: 3000, extract: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Yellow Pages – Business Search
Search: "${cfg.searchTerm}" in "${cfg.location}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with CDP connection to real Chrome.
"""

import re
import os
import sys
import shutil
import json
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import Playwright, sync_playwright


# ── Inline CDP utilities (no external dependency) ────────────────────────────

def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get_temp_profile_dir(site: str = "default") -> str:
    tmp = os.path.join(tempfile.gettempdir(), f"{site}_chrome_profile_{os.getpid()}")
    os.makedirs(tmp, exist_ok=True)
    return tmp


def find_chrome_executable() -> str:
    for candidate in [
        os.environ.get("CHROME_PATH", ""),
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
    ]:
        if candidate and os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError("Could not find Chrome/Chromium.")


def launch_chrome(profile_dir: str, port: int, headless: bool = False) -> subprocess.Popen:
    chrome_path = find_chrome_executable()
    flags = [
        chrome_path,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "--remote-allow-origins=*",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-blink-features=AutomationControlled",
        "--disable-extensions",
        "--disable-component-extensions-with-background-pages",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--mute-audio",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
        "--disable-infobars",
        "--no-sandbox",
        "--window-size=1280,987",
        "about:blank",
    ]
    if headless:
        flags.insert(1, "--headless=new")
    return subprocess.Popen(flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wait_for_cdp_ws(port: int, timeout_s: float = 15.0) -> str:
    deadline = time.time() + timeout_s
    last_err = ""
    while time.time() < deadline:
        try:
            resp = urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2)
            data = json.loads(resp.read())
            ws_url = data.get("webSocketDebuggerUrl", "")
            if ws_url:
                return ws_url
        except Exception as e:
            last_err = str(e)
        time.sleep(0.25)
    raise TimeoutError(f"Timed out waiting for Chrome CDP on port {port}: {last_err}")


# ── Main search function ─────────────────────────────────────────────────────

def search_yellow_pages(
    playwright: Playwright,
    search_term: str = "${cfg.searchTerm}",
    location: str = "${cfg.location}",
    max_results: int = ${cfg.maxResults},
) -> list[dict]:
    """
    Search Yellow Pages for a business type in a location and extract listings.

    Parameters:
        search_term: Type of business to search for (e.g. "plumber").
        location: City/state to search in (e.g. "Chicago, IL").
        max_results: Maximum number of listings to extract.

    Returns:
        List of dicts with keys: business_name, phone_number, address, rating.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("yellowpages")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to Yellow Pages ──────────────────────────────────────
        print(f"Loading {cfg.url}...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # ── Dismiss cookie / consent dialogs ──────────────────────────────
        for selector in [
            'button:has-text("Accept")',
            'button:has-text("Accept All")',
            'button:has-text("Got it")',
            'button:has-text("I agree")',
            '#onetrust-accept-btn-handler',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # ── STEP 1: Enter search term ─────────────────────────────────────
        print(f'STEP 1: Search term = "{search_term}"...')
        search_input = page.locator(
            'input#query, '
            'input[name="search_terms"], '
            'input[placeholder*="Find"], '
            'input[aria-label*="Search"]'
        ).first
        search_input.click()
        page.wait_for_timeout(300)
        search_input.press("Control+a")
        search_input.fill(search_term)
        print(f'  Typed "{search_term}"')
        page.wait_for_timeout(1000)

        # ── STEP 2: Enter location ────────────────────────────────────────
        print(f'STEP 2: Location = "{location}"...')
        location_input = page.locator(
            'input#location, '
            'input[name="geo_location_terms"], '
            'input[placeholder*="location"], '
            'input[placeholder*="Location"], '
            'input[aria-label*="Location"], '
            'input[aria-label*="location"]'
        ).first
        location_input.click()
        page.wait_for_timeout(300)
        location_input.press("Control+a")
        location_input.fill(location)
        print(f'  Typed "{location}"')
        page.wait_for_timeout(1000)

        # ── STEP 3: Click Search ──────────────────────────────────────────
        print("STEP 3: Clicking search button...")
        search_btn = page.locator(
            'button#search-button, '
            'button[type="submit"], '
            'input[type="submit"], '
            'button:has-text("Find")'
        ).first
        search_btn.click()
        print("  Clicked search")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Results URL: {page.url}")

        # ── STEP 4: Extract business listings ─────────────────────────────
        print(f"STEP 4: Extracting up to {max_results} listings...")

        # Yellow Pages uses .result divs or .srp-listing
        listing_cards = page.locator(
            'div.result, '
            'div.v-card, '
            'div.search-results div.info, '
            '[class*="srp-listing"]'
        )
        count = listing_cards.count()
        print(f"  Found {count} listing cards")

        seen_names = set()
        for i in range(count):
            if len(results) >= max_results:
                break
            card = listing_cards.nth(i)
            try:
                # Business name
                biz_name = "N/A"
                try:
                    name_el = card.locator(
                        'a.business-name, '
                        'h2 a, '
                        '[class*="business-name"], '
                        'a[class*="name"]'
                    ).first
                    biz_name = name_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                if biz_name == "N/A" or biz_name.lower() in seen_names:
                    continue
                seen_names.add(biz_name.lower())

                # Phone number
                phone = "N/A"
                try:
                    phone_el = card.locator(
                        '[class*="phone"], '
                        'a[href^="tel:"], '
                        '[data-phone]'
                    ).first
                    phone = phone_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Address
                address = "N/A"
                try:
                    addr_el = card.locator(
                        '[class*="adr"], '
                        '[class*="address"], '
                        '[class*="street-address"], '
                        '.locality'
                    ).first
                    address = addr_el.inner_text(timeout=2000).strip()
                    # Clean up multi-line addresses
                    address = re.sub(r"\\s+", " ", address).strip()
                except Exception:
                    pass

                # Rating
                rating = "N/A"
                try:
                    rating_el = card.locator(
                        '[class*="rating"] [class*="count"], '
                        '[class*="rating"]'
                    ).first
                    rating_text = rating_el.get_attribute("class", timeout=2000) or ""
                    # YP uses class like "result-rating three" or data attributes
                    rating_words = {
                        "one": "1", "two": "2", "three": "3",
                        "four": "4", "five": "5", "half": ".5",
                    }
                    for word, val in rating_words.items():
                        if word in rating_text:
                            if "half" in rating_text:
                                for w2, v2 in rating_words.items():
                                    if w2 != "half" and w2 in rating_text:
                                        rating = str(int(v2) + 0.5)
                                        break
                            else:
                                rating = val
                            break
                    # Fallback: try aria-label or text
                    if rating == "N/A":
                        try:
                            aria = rating_el.get_attribute("aria-label", timeout=1000) or ""
                            rm = re.search(r"([\\d.]+)", aria)
                            if rm:
                                rating = rm.group(1)
                        except Exception:
                            pass
                except Exception:
                    pass

                results.append({
                    "business_name": biz_name,
                    "phone_number": phone,
                    "address": address,
                    "rating": rating,
                })
            except Exception:
                continue

        # ── Fallback: regex on page text ──────────────────────────────────
        if not results:
            print("  Card extraction failed, trying text fallback...")
            body_text = page.evaluate("document.body.innerText") or ""
            lines = body_text.split("\\n")
            for i, line in enumerate(lines):
                if len(results) >= max_results:
                    break
                phone_match = re.search(r"\\(\\d{3}\\)\\s*\\d{3}-\\d{4}", line)
                if phone_match:
                    biz_name = "N/A"
                    for j in range(max(0, i - 3), i):
                        cand = lines[j].strip()
                        if cand and len(cand) > 3 and not re.match(r"^\\(", cand):
                            biz_name = cand
                    if biz_name != "N/A":
                        results.append({
                            "business_name": biz_name,
                            "phone_number": phone_match.group(0),
                            "address": "N/A",
                            "rating": "N/A",
                        })

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} listings for \\"{search_term}\\" in \\"{location}\\":")
        for i, biz in enumerate(results, 1):
            print(f"  {i}. {biz['business_name']}")
            print(f"     Phone: {biz['phone_number']}  Address: {biz['address']}  Rating: {biz['rating']}")

    except Exception as e:
        import traceback
        print(f"Error: {e}")
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
        items = search_yellow_pages(playwright)
        print(f"\\nTotal listings found: {len(items)}")
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function dismissPopups(page) {
  console.log("🔲 Dismissing popups...");
  for (const selector of [
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("Got it")',
    '#onetrust-accept-btn-handler',
  ]) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        console.log("   ✅ Dismissed popup");
        break;
      }
    } catch (e) { /* no popup */ }
  }
  await page.waitForTimeout(500);
}

async function enterSearchTerm(stagehand, page, recorder, searchTerm) {
  console.log(`🎯 STEP 1: Search term = "${searchTerm}"...`);

  await observeAndAct(stagehand, page, recorder,
    `Click the search input field for finding a business`,
    "Click search input"
  );
  await page.waitForTimeout(500);

  await stagehand.act(`Select all text in the search input and type '${searchTerm}'`);
  console.log(`   ✅ Typed "${searchTerm}"`);
  recorder.record("act", {
    instruction: `Type '${searchTerm}' into search`,
    description: `Fill search term: ${searchTerm}`,
    method: "type",
  });

  await page.waitForTimeout(CFG.waits.type);
}

async function enterLocation(stagehand, page, recorder, location) {
  console.log(`🎯 STEP 2: Location = "${location}"...`);

  await observeAndAct(stagehand, page, recorder,
    `Click the location input field`,
    "Click location input"
  );
  await page.waitForTimeout(500);

  await stagehand.act(`Select all text in the location input and type '${location}'`);
  console.log(`   ✅ Typed "${location}"`);
  recorder.record("act", {
    instruction: `Type '${location}' into location`,
    description: `Fill location: ${location}`,
    method: "type",
  });

  await page.waitForTimeout(CFG.waits.type);
}

async function clickSearch(stagehand, page, recorder) {
  console.log("🎯 STEP 3: Clicking Search...");

  await observeAndAct(stagehand, page, recorder,
    `Click the search button to find businesses`,
    "Click search button"
  );
  console.log("   ✅ Clicked search");

  await page.waitForTimeout(CFG.waits.search);
  console.log(`   📍 URL: ${page.url()}`);
}

async function extractListings(stagehand, page, recorder, maxResults) {
  console.log(`🎯 STEP 4: Extract up to ${maxResults} business listings...`);
  const { z } = require("zod/v3");

  const data = await stagehand.extract(
    `Extract up to ${maxResults} business listings from the search results. For each listing get the business name, phone number, full address, and rating (as a number like 3.5 or N/A if not available).`,
    z.object({
      listings: z.array(z.object({
        business_name: z.string(),
        phone_number: z.string(),
        address: z.string(),
        rating: z.string(),
      })),
    })
  );

  console.log(`   ✅ Extracted ${data.listings.length} listings`);
  recorder.record("extract", {
    instruction: "Extract business listings",
    description: `Extract up to ${maxResults} listings with name, phone, address, rating`,
    results: data,
  });

  return data.listings.slice(0, maxResults);
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient();

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    // Navigate
    console.log(`\n🌐 Navigating to ${CFG.url}...`);
    await page.goto(CFG.url);
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: CFG.url, description: `Navigate to ${CFG.url}` });
    console.log(`   📍 URL: ${page.url()}`);

    // Dismiss popups
    await dismissPopups(page);

    // Enter search term
    await enterSearchTerm(stagehand, page, recorder, CFG.searchTerm);

    // Enter location
    await enterLocation(stagehand, page, recorder, CFG.location);

    // Click search
    await clickSearch(stagehand, page, recorder);

    // Extract listings
    const listings = await extractListings(stagehand, page, recorder, CFG.maxResults);

    // Print results
    console.log(`\n📊 Found ${listings.length} listings for "${CFG.searchTerm}" in "${CFG.location}":\n`);
    listings.forEach((biz, i) => {
      console.log(`  ${i + 1}. ${biz.business_name}`);
      console.log(`     Phone: ${biz.phone_number}  Address: ${biz.address}  Rating: ${biz.rating}`);
    });

    // Save Python script
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "yellowpages_search.py");
    fs.writeFileSync(pyPath, pyCode, "utf-8");
    console.log(`\n💾 Saved Python script → ${pyPath}`);

    // Save recorded actions
    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`💾 Saved recorded actions → ${jsonPath}`);

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await stagehand.close();
  }
})();
