"""
Auto-generated Playwright script (Python)
Steam Store – Game Search
Search: "open world RPG"

Uses Playwright's native locator API with CDP connection to real Chrome.
"""

import re
import os
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

def search_steam(
    playwright: Playwright,
    search_term: str = "open world RPG",
    max_results: int = 5,
) -> list[dict]:
    """
    Search Steam Store for games and extract listings.

    Parameters:
        search_term: Game search query.
        max_results: Maximum number of games to extract.

    Returns:
        List of dicts with keys: title, price, release_date, review_summary.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("steam")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to Steam search ──────────────────────────────────────
        search_url = f"https://store.steampowered.com/search/?term={url_quote(search_term)}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # ── Dismiss age gate / cookie banners ─────────────────────────────
        for selector in [
            '#acceptAllButton',
            'button:has-text("Accept All")',
            '#agecheck_form button',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1000):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # ── Extract games ─────────────────────────────────────────────────
        print(f"Extracting up to {max_results} games...")

        # Steam search results use <a> tags with class "search_result_row"
        game_rows = page.locator('a.search_result_row')
        count = game_rows.count()
        print(f"  Found {count} search result rows")

        for i in range(min(count, max_results)):
            row = game_rows.nth(i)
            try:
                # Title
                title = "N/A"
                try:
                    t_el = row.locator('span.title').first
                    title = t_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                if title == "N/A":
                    continue

                # Price
                price = "N/A"
                try:
                    # Check for discount price first
                    disc_el = row.locator('.discount_final_price, .search_price')
                    p_text = disc_el.first.inner_text(timeout=2000).strip()
                    # Clean up price text
                    p_m = re.search(r'(\$[\d,.]+|Free|Free to Play)', p_text, re.IGNORECASE)
                    if p_m:
                        price = p_m.group(1)
                    elif "free" in p_text.lower():
                        price = "Free"
                except Exception:
                    pass

                # Release date
                release_date = "N/A"
                try:
                    d_el = row.locator('.search_released').first
                    release_date = d_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Review summary
                review_summary = "N/A"
                try:
                    r_el = row.locator('.search_review_summary').first
                    # The review tooltip has the summary text
                    review_summary = r_el.get_attribute("data-tooltip-html", timeout=2000) or "N/A"
                    # Extract just the summary text (e.g. "Very Positive")
                    m = re.search(r'(Overwhelmingly Positive|Very Positive|Positive|Mostly Positive|Mixed|Mostly Negative|Negative|Very Negative|Overwhelmingly Negative)', review_summary, re.IGNORECASE)
                    if m:
                        review_summary = m.group(1)
                    else:
                        review_summary = review_summary.split("<br>")[0].strip()
                except Exception:
                    pass

                results.append({
                    "title": title,
                    "price": price,
                    "release_date": release_date,
                    "review_summary": review_summary,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} games for "{search_term}":')
        for i, g in enumerate(results, 1):
            print(f"  {i}. {g['title']}")
            print(f"     Price: {g['price']}  Released: {g['release_date']}  Reviews: {g['review_summary']}")

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
        items = search_steam(playwright)
        print(f"\nTotal games found: {len(items)}")
