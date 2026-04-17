"""
Auto-generated Playwright script (Python)
Wikipedia – Category Page
Category: Category:Programming languages

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
    category: str = "Category:Programming languages",
    max_results: int = 20,
) -> list[dict]:
    """
    Navigate to a Wikipedia category page and extract subcategories/pages.

    Parameters:
        category: The Wikipedia category (e.g. "Category:Programming languages").
        max_results: Maximum number of items to extract.

    Returns:
        List of dicts with keys: title, type ("subcategory" or "page").
    """
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
        print(f"\nFound {len(results)} items in '{category}':")
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
        print(f"\nTotal items found: {len(items)}")
