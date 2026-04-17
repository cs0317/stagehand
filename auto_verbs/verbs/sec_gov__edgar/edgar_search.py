"""
Auto-generated Playwright script (Python)
SEC EDGAR – Filing Search
Company: Tesla (TSLA)

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

def search_edgar(
    playwright: Playwright,
    ticker: str = "TSLA",
    max_results: int = 5,
) -> list[dict]:
    """
    Search SEC EDGAR for company filings and extract listings.

    Parameters:
        ticker: Company ticker symbol.
        max_results: Maximum number of filings to extract.

    Returns:
        List of dicts with keys: filing_type, filing_date, description, filing_link.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("sec_edgar")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to EDGAR full-text search (EFTS) ─────────────────────
        # The new EDGAR search is at efts.sec.gov/LATEST/search-index
        # Or use the EDGAR company filings page
        search_url = f"https://efts.sec.gov/LATEST/search-index?q=%22{url_quote(ticker)}%22&dateRange=custom&startdt=2023-01-01&enddt=2026-12-31&forms=10-K,10-Q,8-K"
        # Alternative: use the company search
        company_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=&CIK={url_quote(ticker)}&type=&dateb=&owner=include&count=40&search_text=&action=getcompany"
        print(f"Loading EDGAR company filings for {ticker}...")
        page.goto(company_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # Check if we got redirected to the new EDGAR
        if "efts" in page.url or "edgar/browse" in page.url:
            # New EDGAR interface
            print("  Using new EDGAR interface...")
            # Navigate to EDGAR search for the ticker
            new_url = f"https://efts.sec.gov/LATEST/search-index?q=%22{url_quote(ticker)}%22&forms=10-K,10-Q,8-K"
            page.goto(new_url)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(3000)

        # ── Try EDGAR full-text search ────────────────────────────────────
        # The modern EDGAR search at https://efts.sec.gov/LATEST/search-index
        # Or the company filings page at /cgi-bin/browse-edgar
        body_text = page.evaluate("document.body.innerText") or ""

        # ── Extract filings from table ────────────────────────────────────
        print(f"Extracting up to {max_results} filings...")

        # Old EDGAR: table rows with filing info
        filing_rows = page.locator('table.tableFile2 tr')
        count = filing_rows.count()
        print(f"  Found {count} table rows (old EDGAR)")

        if count > 1:  # Skip header row
            for i in range(1, min(count, max_results + 1)):
                row = filing_rows.nth(i)
                try:
                    cells = row.locator('td')
                    if cells.count() < 4:
                        continue

                    filing_type = cells.nth(0).inner_text(timeout=2000).strip()
                    # Link to filing
                    filing_link = "N/A"
                    try:
                        link = cells.nth(1).locator('a').first
                        filing_link = link.get_attribute("href", timeout=2000) or "N/A"
                        if filing_link.startswith("/"):
                            filing_link = f"https://www.sec.gov{filing_link}"
                    except Exception:
                        pass
                    description = cells.nth(2).inner_text(timeout=2000).strip()
                    filing_date = cells.nth(3).inner_text(timeout=2000).strip()

                    results.append({
                        "filing_type": filing_type,
                        "filing_date": filing_date,
                        "description": description,
                        "filing_link": filing_link,
                    })
                except Exception:
                    continue
        else:
            # New EDGAR or different layout
            print("  Trying new EDGAR layout...")
            # Try EDGAR full-text search results
            result_items = page.locator('.filing-result, [class*="result"], tr[class*="filing"]')
            alt_count = result_items.count()
            print(f"  Found {alt_count} result items")

            if alt_count == 0:
                # Fallback: extract from body text
                print("  Trying body text fallback...")
                # Look for filing type patterns
                pattern = re.compile(
                    r'(10-K|10-Q|8-K|S-1|DEF 14A|13F)\s+'
                    r'(\d{4}-\d{2}-\d{2})\s+'
                    r'(.+?)(?:\n|$)',
                    re.MULTILINE
                )
                for m in pattern.finditer(body_text):
                    if len(results) >= max_results:
                        break
                    results.append({
                        "filing_type": m.group(1),
                        "filing_date": m.group(2),
                        "description": m.group(3).strip()[:100],
                        "filing_link": "N/A",
                    })

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} filings for {ticker}:')
        for i, f in enumerate(results, 1):
            print(f"  {i}. {f['filing_type']} - {f['filing_date']}")
            print(f"     {f['description'][:80]}")
            print(f"     Link: {f['filing_link'][:80]}")

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
        items = search_edgar(playwright)
        print(f"\nTotal filings found: {len(items)}")
