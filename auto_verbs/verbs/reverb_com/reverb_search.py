"""
Auto-generated Playwright script (Python)
Reverb – Musical Instrument Search
Search: "Fender Stratocaster"

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
        "--disable-dev-shm-usage", "--disable-gpu", "--disable-extensions",
        "--disable-background-networking", "--disable-sync",
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

def search_reverb(
    playwright: Playwright,
    search_term: str = "Fender Stratocaster",
    max_results: int = 5,
) -> list[dict]:
    """
    Search Reverb.com for musical instruments and extract listings.

    Parameters:
        search_term: Instrument to search for.
        max_results: Maximum number of listings to extract.

    Returns:
        List of dicts with keys: item_title, condition, price, seller_name, location.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("reverb")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to Reverb search ─────────────────────────────────────
        search_url = f"https://reverb.com/marketplace?query={search_term.replace(' ', '+')}"
        print(f"Loading {search_url}...")
        page.goto(search_url, wait_until="domcontentloaded")

        # Reverb SPA does client-side redirects - wait for final stable state
        stable_count = 0
        for attempt in range(30):
            try:
                link_count = page.evaluate("document.querySelectorAll(\"a[href*='/item/']\").length")
                if link_count > 0:
                    stable_count += 1
                    if stable_count >= 3:  # links present for 3 consecutive checks
                        print(f"  Content stable after {attempt + 1} polls ({link_count} links)")
                        # Extract immediately within stable window
                        raw = page.evaluate("""(maxResults) => {
                            const cards = document.querySelectorAll("a[href*='/item/']");
                            const results = [];
                            const seen = new Set();
                            for (const a of cards) {
                                if (results.length >= maxResults) break;
                                const li = a.closest('li') || a.closest('[class*="listing-card"]') || a.parentElement;
                                if (!li) continue;
                                const title = a.textContent.trim();
                                if (!title || title.length < 5 || seen.has(title.toLowerCase())) continue;
                                seen.add(title.toLowerCase());
                                const text = li.textContent || '';
                                results.push({ title, text });
                            }
                            return results;
                        }""", max_results)
                        break
                else:
                    stable_count = 0
            except Exception:
                stable_count = 0
                raw = []
            page.wait_for_timeout(1000)
        else:
            raw = []
        print(f"  Loaded: {page.url}")

        # Check for bot detection
        body_text = (page.evaluate("document.body.innerText") or "")[:300]
        if any(kw in body_text.lower() for kw in ["captcha", "bot or not", "just a moment", "verify you are human"]):
            print("  Bot detection detected. Skipping.")
            return results

        # ── Dismiss cookie banner ─────────────────────────────────────────
        for selector in [
            'button:has-text("Accept")',
            'button:has-text("Accept All")',
            'button:has-text("Got It")',
            '#onetrust-accept-btn-handler',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1000):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # ── Parse raw extraction results ─────────────────────────────────
        print(f"Extracting up to {max_results} listings...")

        for item in raw:
            title = item["title"]
            text = item["text"]

            # Price – get the last dollar amount (final/current price)
            price = "N/A"
            price_matches = re.findall(r'\$[\d,]+(?:\.\d+)?', text)
            if price_matches:
                price = price_matches[-1]

            # Condition – "Used – Good", "Brand New", etc.
            condition = "N/A"
            cond_m = re.search(r'(Used\s*[–-]\s*(?:Excellent|Very Good|Good|Fair|Poor))', text)
            if not cond_m:
                cond_m = re.search(r'(Brand New|B-Stock|Mint)', text)
            if cond_m:
                condition = cond_m.group(1).strip()

            results.append({
                "item_title": title,
                "condition": condition,
                "price": price,
                "seller_name": "N/A",
                "location": "N/A",
            })

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} listings for "{search_term}":')
        for i, l in enumerate(results, 1):
            print(f"  {i}. {l['item_title']}")
            print(f"     Price: {l['price']}  Condition: {l['condition']}  Seller: {l['seller_name']}  Location: {l['location']}")

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
        items = search_reverb(playwright)
        print(f"\nTotal listings found: {len(items)}")
