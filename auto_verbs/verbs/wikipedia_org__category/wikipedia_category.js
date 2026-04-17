const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Wikipedia – Category Page
 *
 * Navigate to a Wikipedia category page and extract subcategories
 * and page titles listed under that category.
 * Records interactions and generates a Python Playwright script.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://en.wikipedia.org",
  category: "Category:Programming languages",
  maxResults: 20,
  waits: { page: 3000, nav: 2000, extract: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Wikipedia – Category Page
Category: ${cfg.category}

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
from urllib.request import urlopen, quote
from playwright.sync_api import Playwright, sync_playwright


# ── Inline CDP utilities ─────────────────────────────────────────────────────

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


# ── Main function ────────────────────────────────────────────────────────────

def extract_category(
    playwright: Playwright,
    category: str = "${cfg.category}",
    max_results: int = ${cfg.maxResults},
) -> list[dict]:
    port = get_free_port()
    profile_dir = get_temp_profile_dir("wikipedia_category")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to category page ─────────────────────────────────────
        cat_slug = category.replace(" ", "_")
        url = f"https://en.wikipedia.org/wiki/{cat_slug}"
        print(f"Loading {url}...")
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── Extract subcategories ─────────────────────────────────────────
        print("Extracting subcategories...")
        subcat_links = page.locator('#mw-subcategories .CategoryTreeItem a, #mw-subcategories li a')
        subcat_count = subcat_links.count()
        print(f"  Found {subcat_count} subcategory links")

        for i in range(subcat_count):
            if len(results) >= max_results:
                break
            try:
                title = subcat_links.nth(i).inner_text(timeout=2000).strip()
                if title:
                    results.append({"title": title, "type": "subcategory"})
            except Exception:
                pass

        # ── Extract pages ─────────────────────────────────────────────────
        if len(results) < max_results:
            print("Extracting pages...")
            page_links = page.locator('#mw-pages li a')
            page_count = page_links.count()
            print(f"  Found {page_count} page links")

            for i in range(page_count):
                if len(results) >= max_results:
                    break
                try:
                    title = page_links.nth(i).inner_text(timeout=2000).strip()
                    if title:
                        results.append({"title": title, "type": "page"})
                except Exception:
                    pass

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} items in '{category}':")
        for i, item in enumerate(results, 1):
            print(f"  {i}. [{item['type']}] {item['title']}")

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
        items = extract_category(playwright)
        print(f"\\nTotal items found: {len(items)}")
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function extractCategoryItems(stagehand, page, recorder, maxResults) {
  console.log(`🎯 Extract up to ${maxResults} category items...`);
  const { z } = require("zod/v3");

  const data = await stagehand.extract(
    `Extract up to ${maxResults} subcategories and page titles listed on this Wikipedia category page. For each item, provide the title and whether it is a "subcategory" or a "page".`,
    z.object({
      items: z.array(z.object({
        title: z.string(),
        type: z.enum(["subcategory", "page"]),
      })),
    })
  );

  console.log(`   ✅ Extracted ${data.items.length} items`);
  recorder.record("extract", {
    instruction: "Extract category items",
    description: `Extract up to ${maxResults} subcategories/pages`,
    results: data,
  });

  return data.items.slice(0, maxResults);
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
    const catSlug = CFG.category.replace(/ /g, "_");
    const url = `${CFG.url}/wiki/${catSlug}`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url);
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Navigate to ${url}` });
    console.log(`   📍 URL: ${page.url()}`);

    const items = await extractCategoryItems(stagehand, page, recorder, CFG.maxResults);

    console.log(`\n📊 Found ${items.length} items in "${CFG.category}":\n`);
    items.forEach((item, i) => {
      console.log(`  ${i + 1}. [${item.type}] ${item.title}`);
    });

    // Save Python script
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "wikipedia_category.py");
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
