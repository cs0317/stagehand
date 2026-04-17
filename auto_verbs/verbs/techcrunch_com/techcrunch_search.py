"""
Auto-generated Playwright script (Python)
TechCrunch – Article Search
Search: "artificial intelligence startup"

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
from urllib.parse import quote as url_quote
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


# ── Main function ────────────────────────────────────────────────────────────

def search_techcrunch(
    playwright: Playwright,
    search_term: str = "artificial intelligence startup",
    max_results: int = 5,
) -> list[dict]:
    """
    Search TechCrunch for articles and extract listings.

    Parameters:
        search_term: Topic to search for.
        max_results: Maximum number of articles to extract.

    Returns:
        List of dicts with keys: headline, author, publication_date, summary.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("techcrunch")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to TechCrunch search ─────────────────────────────────
        search_url = f"https://techcrunch.com/?s={url_quote(search_term)}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # ── Dismiss cookie / consent ──────────────────────────────────────
        for selector in [
            '#onetrust-accept-btn-handler',
            'button:has-text("Accept All")',
            'button:has-text("Accept")',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1000):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # ── Extract articles ──────────────────────────────────────────────
        print(f"Extracting up to {max_results} articles...")

        # TechCrunch search uses loop-card components
        article_cards = page.locator('div.loop-card__content')
        count = article_cards.count()
        print(f"  Found {count} loop-card__content elements")

        # Fallback to outer loop-card
        if count == 0:
            article_cards = page.locator('div.loop-card')
            count = article_cards.count()
            print(f"  Fallback: found {count} loop-card elements")

        seen_headlines = set()
        for i in range(count):
            if len(results) >= max_results:
                break
            card = article_cards.nth(i)
            try:
                # Headline
                headline = "N/A"
                try:
                    h_el = card.locator('a.loop-card__title-link, h3.loop-card__title a').first
                    headline = h_el.inner_text(timeout=2000).strip()
                except Exception:
                    try:
                        h_el = card.locator('h3 a, h2 a').first
                        headline = h_el.inner_text(timeout=2000).strip()
                    except Exception:
                        pass

                if headline == "N/A" or headline.lower() in seen_headlines:
                    continue
                seen_headlines.add(headline.lower())

                # Author
                author = "N/A"
                try:
                    a_el = card.locator('ul.loop-card__author-list a, [class*="author"] a').first
                    author = a_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Publication date
                pub_date = "N/A"
                try:
                    d_el = card.locator('time[datetime]').first
                    pub_date = d_el.get_attribute("datetime", timeout=2000) or d_el.inner_text(timeout=2000)
                    pub_date = pub_date.strip()
                except Exception:
                    pass

                # Category (TechCrunch shows category instead of summary on search)
                category = "N/A"
                try:
                    c_el = card.locator('span.loop-card__cat').first
                    category = c_el.inner_text(timeout=1000).strip()
                except Exception:
                    pass

                results.append({
                    "headline": headline,
                    "author": author,
                    "publication_date": pub_date,
                    "summary": f"[{category}]" if category != "N/A" else "N/A",
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} articles for "{search_term}":')
        for i, a in enumerate(results, 1):
            print(f"  {i}. {a['headline']}")
            print(f"     Author: {a['author']}  Date: {a['publication_date']}")
            print(f"     Summary: {a['summary'][:100]}...")

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
        items = search_techcrunch(playwright)
        print(f"\nTotal articles found: {len(items)}")
