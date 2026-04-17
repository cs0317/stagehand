"""
Auto-generated Playwright script (Python)
The Guardian – Article Search
Search: "climate change policy"

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

def search_guardian(
    playwright: Playwright,
    search_term: str = "climate change policy",
    max_results: int = 5,
) -> list[dict]:
    """
    Search The Guardian for articles and extract listings.

    Parameters:
        search_term: Topic to search for.
        max_results: Maximum number of articles to extract.

    Returns:
        List of dicts with keys: headline, author, publication_date, summary.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("theguardian")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to Guardian search ───────────────────────────────────
        # Guardian's own /search endpoint redirects to Google CSE.
        # Use Google site-restricted search directly for reliability.
        search_url = f"https://www.google.com/search?q={url_quote(search_term)}+site%3Atheguardian.com"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # ── Extract Google search result links to Guardian articles ───────
        print(f"Extracting up to {max_results} article links from search results...")
        link_els = page.locator('a[href*="theguardian.com"] h3')
        link_count = link_els.count()
        print(f"  Found {link_count} Guardian result links")

        article_urls = []
        for i in range(min(link_count, max_results)):
            try:
                h3 = link_els.nth(i)
                parent_a = h3.locator("xpath=ancestor::a[1]")
                href = parent_a.get_attribute("href", timeout=2000)
                if href and "theguardian.com" in href:
                    article_urls.append(href)
            except Exception:
                continue

        print(f"  Collected {len(article_urls)} article URLs")

        # ── Visit each article and extract details ────────────────────────
        for idx, url in enumerate(article_urls):
            try:
                print(f"  Visiting article {idx + 1}: {url}")
                page.goto(url)
                page.wait_for_load_state("domcontentloaded")
                page.wait_for_timeout(2000)

                # Dismiss cookie/consent banners
                for selector in [
                    'button:has-text("Accept")',
                    'button:has-text("Yes")',
                    'button:has-text("OK")',
                    '[data-link-name="reject all"]',
                ]:
                    try:
                        btn = page.locator(selector).first
                        if btn.is_visible(timeout=1000):
                            btn.click()
                            page.wait_for_timeout(500)
                            break
                    except Exception:
                        pass

                # Headline
                headline = "N/A"
                try:
                    h_el = page.locator('h1, [data-gu-name="headline"] h1').first
                    headline = h_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                # Author / byline
                author = "N/A"
                try:
                    a_el = page.locator('[rel="author"], address a, [data-link-name="byline"]').first
                    author = a_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Publication date
                pub_date = "N/A"
                try:
                    d_el = page.locator('time[datetime], [data-gu-name="meta"] time, label[for="dateToggle"] ~ time, details time').first
                    pub_date = d_el.get_attribute("datetime", timeout=2000) or d_el.inner_text(timeout=2000)
                    pub_date = pub_date.strip()
                except Exception:
                    # Fallback: try extracting from meta tags
                    try:
                        pub_date = page.evaluate("""() => {
                            const meta = document.querySelector('meta[property="article:published_time"], meta[name="DC.date.issued"]');
                            return meta ? meta.content : "N/A";
                        }""")
                    except Exception:
                        pass

                # Summary / standfirst
                summary = "N/A"
                try:
                    s_el = page.locator('[data-gu-name="standfirst"] p, [class*="standfirst"] p, article p').first
                    summary = s_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                results.append({
                    "headline": headline,
                    "author": author,
                    "publication_date": pub_date,
                    "summary": summary[:200],
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
        items = search_guardian(playwright)
        print(f"\nTotal articles found: {len(items)}")
