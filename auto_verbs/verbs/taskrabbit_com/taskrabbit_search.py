"""
Auto-generated Playwright script (Python)
TaskRabbit – Tasker Search
Service: "furniture assembly" in "San Francisco, CA"

Uses Playwright's native locator API with CDP connection to real Chrome.
Multi-step booking flow: location -> item type -> task size -> description -> browse taskers.
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

def search_taskrabbit(
    playwright: Playwright,
    service_type: str = "furniture assembly",
    location: str = "San Francisco, CA",
    max_results: int = 5,
) -> list[dict]:
    """
    Search TaskRabbit for taskers via the booking flow and extract listings.

    Parameters:
        service_type: Type of service (used for category URL slug).
        location: Location for the service.
        max_results: Maximum number of taskers to extract.

    Returns:
        List of dicts with keys: name, tasks_completed, rating, hourly_rate.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("taskrabbit")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Step 1: Start booking flow ────────────────────────────────────
        # Service ID 2030 = Furniture Assembly
        book_url = "https://www.taskrabbit.com/book/2030/details?form_referrer=services_page"
        print(f"Loading booking page...")
        page.goto(book_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # ── Step 2: Enter location ────────────────────────────────────────
        print(f"Entering location: {location}...")
        loc_input = page.locator('input#location, input[name="location"]').first
        loc_input.click()
        page.wait_for_timeout(500)
        loc_input.fill(location)
        page.wait_for_timeout(2000)

        # Select first autocomplete suggestion
        suggestions = page.locator('[class*="suggestion"], [role="listbox"] li, [role="option"]')
        if suggestions.count() > 0:
            suggestions.first.click()
            page.wait_for_timeout(1000)

        # Click Continue
        page.locator('button:has-text("Continue")').last.click()
        page.wait_for_timeout(2000)
        print("  Location set")

        # ── Step 3: Select item type ──────────────────────────────────────
        print("Selecting item type...")
        try:
            page.locator('text="Other furniture items (non-IKEA)"').first.click()
            page.wait_for_timeout(1000)
            page.locator('button:has-text("Continue")').last.click()
            page.wait_for_timeout(2000)
            print("  Item type selected")
        except Exception:
            print("  Item type step skipped")

        # ── Step 4: Select task size ──────────────────────────────────────
        print("Selecting task size...")
        try:
            page.locator('text="Small - Est. 1 hr"').first.click()
            page.wait_for_timeout(1000)
        except Exception:
            print("  Task size step skipped")

        # ── Step 5: Fill description and continue ─────────────────────────
        try:
            desc = page.locator('textarea').first
            if desc.is_visible(timeout=2000):
                desc.fill("Need help assembling furniture")
                page.wait_for_timeout(500)
        except Exception:
            pass

        # Click Continue until we reach recommendations (may need multiple clicks)
        for attempt in range(3):
            try:
                cont = page.locator('button:has-text("Continue")')
                if cont.count() > 0:
                    cont.last.click()
                    page.wait_for_timeout(3000)
                    if "recommendations" in page.url:
                        break
            except Exception:
                break

        # If still not on recommendations, try direct navigation
        if "recommendations" not in page.url:
            print("  Navigating directly to recommendations...")
            rec_url = page.url.replace("/details", "/recommendations")
            page.goto(rec_url)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(5000)

        print(f"  Recommendations page: {page.url}")

        # ── Step 6: Extract taskers from recommendations page ─────────────
        print(f"Extracting up to {max_results} taskers...")

        # Wait for tasker profiles to load
        page.wait_for_timeout(3000)

        # Extract via body text parsing - TaskRabbit renders complex React components
        # The page shows tasker entries like:
        # Hamza B.
        # $77.68/hr
        # 5.0 (820 reviews)
        # 1547 Furniture Assembly tasks
        body = page.evaluate("document.body.innerText") or ""

        # Pattern: Name (e.g. "Hamza B.") followed by rate, rating, tasks on subsequent lines
        lines = body.split("\n")
        i = 0
        while i < len(lines) and len(results) < max_results:
            line = lines[i].strip()
            # Look for name pattern: "FirstName L." (single uppercase + lowercase, space, single uppercase + period)
            name_m = re.match(r'^([A-Z][a-z]+ [A-Z]\.)$', line)
            if name_m and "View" not in line:
                name = name_m.group(1)
                hourly_rate = "N/A"
                rating = "N/A"
                tasks = "N/A"

                # Search next few lines for rate, rating, tasks
                for j in range(i + 1, min(i + 10, len(lines))):
                    jline = lines[j].strip()
                    if not jline:
                        continue
                    rate_m = re.search(r'\$(\d+(?:\.\d+)?)/hr', jline)
                    if rate_m and hourly_rate == "N/A":
                        hourly_rate = f"${rate_m.group(1)}/hr"
                    rating_m = re.search(r'(\d+\.\d+)\s*\((\d+)\s*reviews?\)', jline)
                    if rating_m and rating == "N/A":
                        rating = rating_m.group(1)
                    tasks_m = re.search(r'(\d+(?:,\d+)?)\s+(?:Furniture|Assembly|tasks?)', jline, re.IGNORECASE)
                    if tasks_m and tasks == "N/A":
                        tasks = tasks_m.group(1)
                    # Stop if we hit another name
                    if re.match(r'^[A-Z][a-z]+ [A-Z]\.$', jline) and jline != name:
                        break

                results.append({
                    "name": name,
                    "hourly_rate": hourly_rate,
                    "rating": rating,
                    "tasks_completed": tasks,
                })
            i += 1

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} taskers for "{service_type}" in "{location}":')
        for i, t in enumerate(results, 1):
            print(f"  {i}. {t['name']}")
            print(f"     Rate: {t['hourly_rate']}  Rating: {t['rating']}  Tasks: {t['tasks_completed']}")

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
        items = search_taskrabbit(playwright)
        print(f"\nTotal taskers found: {len(items)}")
