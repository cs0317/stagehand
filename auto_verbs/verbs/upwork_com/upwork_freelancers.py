"""
Auto-generated Playwright script (Python)
Upwork – Freelancer Search
Search: "Python developer"

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

def search_upwork_freelancers(
    playwright: Playwright,
    skill: str = "Python developer",
    max_results: int = 5,
) -> list[dict]:
    """
    Search Upwork for freelancers with a given skill and extract profiles.

    Parameters:
        skill: Skill to search for (e.g. "Python developer").
        max_results: Maximum number of profiles to extract.

    Returns:
        List of dicts with keys: name, title, hourly_rate, job_success_score, total_earnings.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("upwork")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to Upwork freelancer search ──────────────────────────
        search_url = f"https://www.upwork.com/search/profiles/?q={url_quote(skill)}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # Check for bot detection / blocking
        title = page.title().lower()
        body_text_start = (page.evaluate("document.body.innerText") or "")[:500].lower()
        if "blocked" in title or "403" in title or "captcha" in body_text_start or "verify" in body_text_start:
            print("  BLOCKED: Heavy bot-detection detected. Skipping.")
            return results

        # ── Dismiss cookie banners ────────────────────────────────────────
        for selector in [
            'button#onetrust-accept-btn-handler',
            'button:has-text("Accept")',
            'button:has-text("Accept Cookies")',
            'button:has-text("Got it")',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # ── Extract freelancer profiles ───────────────────────────────────
        print(f"Extracting up to {max_results} freelancer profiles...")

        # Upwork uses section or article elements for profiles
        profile_cards = page.locator(
            '[data-test="freelancer-card"], '
            '[data-test="FreelancerCard"], '
            'section[data-test="profile-tile"], '
            '[class*="freelancer-tile"], '
            'article[class*="profile"]'
        )
        count = profile_cards.count()
        print(f"  Found {count} profile cards")

        # Fallback: broader selector
        if count == 0:
            profile_cards = page.locator('div[data-ev-label*="search_results"] > div, .up-card-section')
            count = profile_cards.count()
            print(f"  Fallback: found {count} cards")

        seen_names = set()
        for i in range(count):
            if len(results) >= max_results:
                break
            card = profile_cards.nth(i)
            try:
                # Name
                name = "N/A"
                try:
                    name_el = card.locator(
                        '[data-test="freelancer-name"], '
                        '[class*="freelancer-name"], '
                        'h4, h3, '
                        'a[class*="name"]'
                    ).first
                    name = name_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass
                if name == "N/A" or name.lower() in seen_names:
                    continue
                seen_names.add(name.lower())

                # Title/headline
                title_text = "N/A"
                try:
                    title_el = card.locator(
                        '[data-test="freelancer-title"], '
                        '[class*="freelancer-title"], '
                        '[class*="headline"], '
                        'p[class*="title"]'
                    ).first
                    title_text = title_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Hourly rate
                hourly_rate = "N/A"
                try:
                    rate_el = card.locator(
                        '[data-test="rate"], '
                        '[class*="rate"], '
                        'span:has-text("/hr")'
                    ).first
                    hourly_rate = rate_el.inner_text(timeout=2000).strip()
                    rm = re.search(r"\$[\d.,]+/hr", hourly_rate)
                    if rm:
                        hourly_rate = rm.group(0)
                except Exception:
                    pass

                # Job success score
                job_success = "N/A"
                try:
                    js_el = card.locator(
                        '[data-test="job-success"], '
                        '[class*="job-success"], '
                        'span:has-text("% Job Success")'
                    ).first
                    job_success = js_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Total earnings
                earnings = "N/A"
                try:
                    earn_el = card.locator(
                        '[data-test="earned"], '
                        '[class*="earned"], '
                        'span:has-text("earned")'
                    ).first
                    earnings = earn_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                results.append({
                    "name": name,
                    "title": title_text,
                    "hourly_rate": hourly_rate,
                    "job_success_score": job_success,
                    "total_earnings": earnings,
                })
            except Exception:
                continue

        # ── Fallback: parse page text ─────────────────────────────────────
        if not results:
            print("  Card extraction failed, trying text fallback...")
            body = page.evaluate("document.body.innerText") or ""
            lines = body.split("\n")
            for i, line in enumerate(lines):
                if len(results) >= max_results:
                    break
                rate_m = re.search(r"\$[\d.,]+/hr", line)
                if rate_m:
                    name = "N/A"
                    title_text = "N/A"
                    for j in range(max(0, i - 5), i):
                        c = lines[j].strip()
                        if c and len(c) > 3 and "$" not in c:
                            if name == "N/A":
                                name = c
                            else:
                                title_text = c
                    if name != "N/A":
                        results.append({
                            "name": name,
                            "title": title_text,
                            "hourly_rate": rate_m.group(0),
                            "job_success_score": "N/A",
                            "total_earnings": "N/A",
                        })

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} freelancers for "{skill}":')
        for i, f in enumerate(results, 1):
            print(f"  {i}. {f['name']}")
            print(f"     Title: {f['title']}")
            print(f"     Rate: {f['hourly_rate']}  Success: {f['job_success_score']}  Earned: {f['total_earnings']}")

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
        items = search_upwork_freelancers(playwright)
        print(f"\nTotal freelancers found: {len(items)}")
