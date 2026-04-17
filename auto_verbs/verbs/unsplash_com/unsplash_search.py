"""
Auto-generated Playwright script (Python)
Unsplash – Photo Search
Search: "mountain landscape"

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

def search_unsplash(
    playwright: Playwright,
    search_term: str = "mountain landscape",
    max_results: int = 5,
) -> list[dict]:
    """
    Search Unsplash for photos and extract listings.

    Parameters:
        search_term: What to search for (e.g. "mountain landscape").
        max_results: Maximum number of photos to extract.

    Returns:
        List of dicts with keys: photographer_name, description, num_likes.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("unsplash")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to Unsplash search ───────────────────────────────────
        search_url = f"https://unsplash.com/s/photos/{url_quote(search_term.replace(' ', '-'))}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # ── Dismiss cookie banners ────────────────────────────────────────
        for selector in [
            'button:has-text("Accept")',
            'button:has-text("Got it")',
            'button:has-text("Accept & close")',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # ── Extract photos via img alt + data attributes ──────────────────
        print(f"Extracting up to {max_results} photos...")

        # Unsplash uses figure elements or divs wrapping images
        photo_figures = page.locator('figure[itemprop="image"], figure[data-testid*="photo"], div[data-test*="photo"]')
        count = photo_figures.count()
        print(f"  Found {count} photo figures")

        # Fallback: look for img tags with alt text in search results
        if count == 0:
            photo_figures = page.locator('[data-testid="masonry-grid-count"] figure, [class*="MasonryGrid"] figure')
            count = photo_figures.count()
            print(f"  Fallback masonry: found {count} figures")

        if count == 0:
            # Try broader: all figures with img inside
            photo_figures = page.locator('figure:has(img[src*="unsplash"])')
            count = photo_figures.count()
            print(f"  Broad fallback: found {count} figures")

        seen = set()
        for i in range(count):
            if len(results) >= max_results:
                break
            fig = photo_figures.nth(i)
            try:
                # Photo description / alt text from the img or first link title
                description = "N/A"
                try:
                    img_el = fig.locator('img').first
                    description = img_el.get_attribute("alt", timeout=2000) or "N/A"
                    description = description.strip()
                except Exception:
                    pass
                if description == "N/A":
                    try:
                        title_link = fig.locator('a[itemprop="contentUrl"]').first
                        description = title_link.get_attribute("title", timeout=2000) or "N/A"
                    except Exception:
                        pass

                if description == "N/A":
                    continue

                # Photographer name — extract from user profile link href
                photographer = "N/A"
                try:
                    # Unsplash user links are like /@username
                    user_data = fig.evaluate("""el => {
                        const links = el.querySelectorAll('a[href*="/@"]');
                        for (const a of links) {
                            // Get visible text or extract username from href
                            const text = a.innerText.trim();
                            if (text) return text;
                            const m = a.href.match(/@([^/?]+)/);
                            if (m) return m[1];
                        }
                        return null;
                    }""")
                    if user_data:
                        photographer = user_data
                except Exception:
                    pass

                key = (photographer.lower(), description[:50].lower())
                if key in seen:
                    continue
                seen.add(key)

                # Number of likes — look for like button with text
                num_likes = "N/A"
                try:
                    like_data = fig.evaluate("""el => {
                        const buttons = el.querySelectorAll('button');
                        for (const btn of buttons) {
                            const text = btn.innerText.trim();
                            if (/^\\d+$/.test(text)) return text;
                        }
                        // Also look for aria-label with "like" and a number
                        for (const btn of buttons) {
                            const label = btn.getAttribute('aria-label') || '';
                            const m = label.match(/(\\d[\\d,]*)/);
                            if (m && /like/i.test(label)) return m[1];
                        }
                        return null;
                    }""")
                    if like_data:
                        num_likes = like_data
                except Exception:
                    pass

                results.append({
                    "photographer_name": photographer,
                    "description": description,
                    "num_likes": num_likes,
                })
            except Exception:
                continue

        # ── Fallback: extract from img alt attributes directly ────────────
        if not results:
            print("  Figure extraction failed, trying img alt fallback...")
            imgs = page.locator('img[src*="unsplash.com/photos"], img[srcset*="unsplash"]')
            img_count = imgs.count()
            for i in range(img_count):
                if len(results) >= max_results:
                    break
                try:
                    alt = imgs.nth(i).get_attribute("alt", timeout=1000) or ""
                    if alt and len(alt) > 5:
                        results.append({
                            "photographer_name": "N/A",
                            "description": alt.strip(),
                            "num_likes": "N/A",
                        })
                except Exception:
                    pass

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} photos for "{search_term}":')
        for i, p in enumerate(results, 1):
            print(f"  {i}. Photographer: {p['photographer_name']}")
            print(f"     Description: {p['description'][:80]}")
            print(f"     Likes: {p['num_likes']}")

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
        items = search_unsplash(playwright)
        print(f"\nTotal photos found: {len(items)}")
