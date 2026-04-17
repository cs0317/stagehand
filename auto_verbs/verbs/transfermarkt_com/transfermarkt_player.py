"""
Auto-generated Playwright script (Python)
Transfermarkt – Player Search
Search: "Kylian Mbappé"

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

def search_transfermarkt(
    playwright: Playwright,
    player_name: str = "Kylian Mbappé",
) -> dict:
    """
    Search Transfermarkt for a player and extract profile details.

    Parameters:
        player_name: Name of the player to search for.

    Returns:
        Dict with keys: player_name, current_club, market_value, age, nationality, position.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("transfermarkt")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        # ── Navigate to search ────────────────────────────────────────────
        search_url = f"https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query={url_quote(player_name)}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # Check for bot detection
        title = page.title().lower()
        body_start = (page.evaluate("document.body.innerText") or "")[:500].lower()
        if "blocked" in title or "403" in title or "captcha" in body_start or "bot" in title:
            print("  BLOCKED: Heavy bot-detection detected. Skipping.")
            return result

        # ── Accept cookies ────────────────────────────────────────────────
        for selector in [
            'button:has-text("Accept All")',
            'button:has-text("Accept")',
            'button#onetrust-accept-btn-handler',
            '[title="Accept & continue"]',
            'iframe + div button',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=2000):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # ── Click first player result ─────────────────────────────────────
        print("STEP 1: Clicking top player result...")
        player_link = page.locator(
            'table.items tbody tr td.hauptlink a, '
            '.spielerporträt a, '
            'a[href*="/profil/spieler/"]'
        ).first
        try:
            player_link.wait_for(state="visible", timeout=5000)
            player_link.click()
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(2000)
            print(f"  Navigated to: {page.url}")
        except Exception as e:
            print(f"  Could not click player result: {e}")
            return result

        # ── Extract player profile data ───────────────────────────────────
        print("STEP 2: Extracting player info...")

        # Player name
        pname = "N/A"
        try:
            name_el = page.locator('h1[class*="data-header"], h1, [data-header-title]').first
            pname = name_el.inner_text(timeout=2000).strip()
        except Exception:
            pass

        # Market value
        market_value = "N/A"
        try:
            mv_el = page.locator(
                'a[class*="market-value"], '
                '[class*="market-value"], '
                '[class*="marktwert"]'
            ).first
            market_value = mv_el.inner_text(timeout=2000).strip()
        except Exception:
            pass

        # Extract info table data
        body_text = page.evaluate("document.body.innerText") or ""

        # Current club
        current_club = "N/A"
        try:
            club_match = re.search(r"Current club[:\s]*([^\n]+)", body_text, re.IGNORECASE)
            if club_match:
                current_club = club_match.group(1).strip()
            else:
                # Try from the info table
                club_el = page.locator('span[class*="info-table__content--bold"] a, [class*="hauptpunkt"] a').first
                current_club = club_el.inner_text(timeout=2000).strip()
        except Exception:
            pass

        # Position
        position = "N/A"
        try:
            pos_match = re.search(r"Position[:\s]*([^\n]+)", body_text, re.IGNORECASE)
            if pos_match:
                position = pos_match.group(1).strip()
        except Exception:
            pass

        # Age
        age = "N/A"
        try:
            age_match = re.search(r"(?:Date of birth/Age|Age)[:\s]*.*?(\d{1,2})\s*$", body_text, re.IGNORECASE | re.MULTILINE)
            if not age_match:
                # Look for pattern like "(26)" following a date
                age_match = re.search(r"\((\d{2})\)", body_text)
            if age_match:
                age = age_match.group(1)
        except Exception:
            pass

        # Nationality
        nationality = "N/A"
        try:
            nat_match = re.search(r"Citizenship[:\s]*([^\n]+)", body_text, re.IGNORECASE)
            if not nat_match:
                nat_match = re.search(r"Nationality[:\s]*([^\n]+)", body_text, re.IGNORECASE)
            if nat_match:
                nationality = nat_match.group(1).strip()
        except Exception:
            pass

        result = {
            "player_name": pname,
            "current_club": current_club,
            "market_value": market_value,
            "age": age,
            "nationality": nationality,
            "position": position,
        }

        print(f"\nPlayer Profile:")
        for k, v in result.items():
            print(f"  {k}: {v}")

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

    return result


if __name__ == "__main__":
    with sync_playwright() as playwright:
        info = search_transfermarkt(playwright)
        print(f"\nDone. Got {len(info)} fields.")
