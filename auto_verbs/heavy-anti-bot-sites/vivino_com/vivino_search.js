const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Vivino – Wine Search
 *
 * Search for wines on Vivino and extract listings with name, winery,
 * region, rating, number of ratings, and price.
 */

const CFG = {
  url: "https://www.vivino.com",
  searchTerm: "Pinot Noir",
  maxResults: 5,
  waits: { page: 3000, type: 1500, search: 3000, extract: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Vivino – Wine Search
Search: "${cfg.searchTerm}"

Generated on: ${ts}
Recorded ${n} browser interactions
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
from urllib.request import urlopen, quote
from playwright.sync_api import Playwright, sync_playwright


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
        "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser", "/usr/bin/chromium",
    ]:
        if candidate and os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError("Could not find Chrome/Chromium.")

def launch_chrome(profile_dir: str, port: int, headless: bool = False) -> subprocess.Popen:
    chrome_path = find_chrome_executable()
    flags = [
        chrome_path, f"--remote-debugging-port={port}", f"--user-data-dir={profile_dir}",
        "--remote-allow-origins=*", "--no-first-run", "--no-default-browser-check",
        "--disable-dev-shm-usage", "--disable-gpu", "--disable-software-rasterizer",
        "--disable-blink-features=AutomationControlled", "--disable-extensions",
        "--disable-component-extensions-with-background-pages", "--disable-background-networking",
        "--disable-sync", "--disable-default-apps", "--mute-audio",
        "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling", "--disable-infobars",
        "--no-sandbox", "--window-size=1280,987", "about:blank",
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


def search_vivino(
    playwright: Playwright,
    search_term: str = "${cfg.searchTerm}",
    max_results: int = ${cfg.maxResults},
) -> list[dict]:
    port = get_free_port()
    profile_dir = get_temp_profile_dir("vivino")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate directly to search results ──────────────────────────
        from urllib.parse import quote as url_quote
        search_url = f"https://www.vivino.com/search/wines?q={url_quote(search_term)}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # ── Dismiss cookie banners ────────────────────────────────────────
        for selector in [
            'button:has-text("Accept")',
            'button:has-text("Accept All")',
            'button:has-text("Got it")',
            '#onetrust-accept-btn-handler',
            '[data-testid="cookie-accept"]',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # ── Extract wine cards ────────────────────────────────────────────
        print(f"Extracting up to {max_results} wines...")

        wine_cards = page.locator(
            '[class*="wineCard"], '
            '[class*="wine-card"], '
            '[data-testid*="wine"], '
            '.search-results-list .card'
        )
        count = wine_cards.count()
        print(f"  Found {count} wine cards")

        seen_names = set()
        for i in range(count):
            if len(results) >= max_results:
                break
            card = wine_cards.nth(i)
            try:
                wine_name = "N/A"
                try:
                    name_el = card.locator('[class*="wine-name"], [class*="wineName"], h3, [class*="vintageTitle"]').first
                    wine_name = name_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass
                if wine_name == "N/A" or wine_name.lower() in seen_names:
                    continue
                seen_names.add(wine_name.lower())

                winery = "N/A"
                try:
                    w_el = card.locator('[class*="winery"], [class*="producer"]').first
                    winery = w_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                region = "N/A"
                try:
                    r_el = card.locator('[class*="region"], [class*="country"]').first
                    region = r_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                avg_rating = "N/A"
                try:
                    rt_el = card.locator('[class*="averageRating"], [class*="rating"]').first
                    avg_rating = rt_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                num_ratings = "N/A"
                try:
                    nr_el = card.locator('[class*="ratingCount"], [class*="ratings"]').first
                    num_ratings = nr_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                price = "N/A"
                try:
                    p_el = card.locator('[class*="price"], [class*="addToCart"]').first
                    price = p_el.inner_text(timeout=2000).strip()
                    pm = re.search(r"[\\$€£][\\d.,]+", price)
                    if pm:
                        price = pm.group(0)
                except Exception:
                    pass

                results.append({
                    "wine_name": wine_name,
                    "winery": winery,
                    "region": region,
                    "average_rating": avg_rating,
                    "num_ratings": num_ratings,
                    "price": price,
                })
            except Exception:
                continue

        # ── Fallback: page text ───────────────────────────────────────────
        if not results:
            print("  Card extraction failed, trying text fallback...")
            body = page.evaluate("document.body.innerText") or ""
            lines = body.split("\\n")
            for i, line in enumerate(lines):
                if len(results) >= max_results:
                    break
                rating_m = re.search(r"(\\d\\.\\d)\\s*/\\s*5", line)
                if rating_m:
                    wine_name = "N/A"
                    for j in range(max(0, i - 3), i):
                        c = lines[j].strip()
                        if c and len(c) > 3:
                            wine_name = c
                            break
                    if wine_name != "N/A":
                        results.append({
                            "wine_name": wine_name, "winery": "N/A",
                            "region": "N/A", "average_rating": rating_m.group(1),
                            "num_ratings": "N/A", "price": "N/A",
                        })

        print(f"\\nFound {len(results)} wines for \\"{search_term}\\":")
        for i, w in enumerate(results, 1):
            print(f"  {i}. {w['wine_name']}")
            print(f"     Winery: {w['winery']}  Region: {w['region']}")
            print(f"     Rating: {w['average_rating']}  ({w['num_ratings']})  Price: {w['price']}")

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
        items = search_vivino(playwright)
        print(f"\\nTotal wines found: {len(items)}")
`;
}

(async () => {
  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 1, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const searchUrl = `${CFG.url}/search/wines?q=${encodeURIComponent(CFG.searchTerm)}`;
    console.log(`\n🌐 Navigating to ${searchUrl}...`);
    await page.goto(searchUrl);
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: `Search for "${CFG.searchTerm}"` });

    const { z } = require("zod/v3");
    const data = await stagehand.extract(
      `Extract up to ${CFG.maxResults} wine listings. For each wine get: wine name, winery, region, average rating (out of 5), number of ratings, and price.`,
      z.object({
        wines: z.array(z.object({
          wine_name: z.string(), winery: z.string(), region: z.string(),
          average_rating: z.string(), num_ratings: z.string(), price: z.string(),
        })),
      })
    );
    recorder.record("extract", { instruction: "Extract wine listings", results: data });

    console.log(`\n📊 Found ${data.wines.length} wines:\n`);
    data.wines.forEach((w, i) => {
      console.log(`  ${i+1}. ${w.wine_name} — ${w.winery} (${w.region})`);
      console.log(`     Rating: ${w.average_rating} (${w.num_ratings})  Price: ${w.price}`);
    });

    fs.writeFileSync(path.join(__dirname, "vivino_search.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`\n💾 Saved files.`);
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await stagehand.close();
  }
})();
