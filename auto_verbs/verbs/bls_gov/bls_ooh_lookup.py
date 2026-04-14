"""
BLS.gov – Occupational Outlook Handbook Lookup
Search for an occupation and extract median pay, job outlook, and education.

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    occupation: str = "software developer",
) -> dict:
    print(f"  Occupation: {occupation}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("bls_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {
        "occupation": occupation,
        "median_pay": "N/A",
        "job_outlook": "N/A",
        "entry_level_education": "N/A",
    }

    try:
        # ── Navigate to OOH search ───────────────────────────────────────
        print("Loading BLS Occupational Outlook Handbook search...")
        from urllib.parse import quote
        search_url = f"https://data.bls.gov/search/query/results?cx=013738036195919377644%3A6ih0hfrgl50&q={quote(occupation)}+inurl%3Abls.gov%2Fooh%2F"
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── STEP 1: Click the first OOH result ───────────────────────────
        print(f'STEP 1: Find "{occupation}" in search results...')
        # Skip the generic OOH homepage link, find actual occupation links
        ooh_links = page.locator('a[href*="/ooh/"][href*=".htm"]')
        count = ooh_links.count()
        href = None
        for i in range(count):
            link = ooh_links.nth(i)
            h = link.get_attribute("href")
            if h and "/ooh/" in h and h.endswith(".htm"):
                link_text = link.inner_text(timeout=2000).strip()
                print(f'  Found: "{link_text}"')
                href = h if h.startswith("http") else f"https://www.bls.gov{h}"
                break

        if not href:
            print("  No occupation link found, trying first /ooh/ link")
            href = ooh_links.first.get_attribute("href")
            if href and not href.startswith("http"):
                href = f"https://www.bls.gov{href}"

        page.goto(href)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── STEP 2: Extract from Quick Facts table ────────────────────────
        print("STEP 2: Extract from Quick Facts table...")

        # The Quick Facts table is the first table on the page
        table_text = ""
        try:
            table = page.locator('table').first
            table_text = table.inner_text(timeout=5000)
        except Exception:
            pass

        if not table_text:
            table_text = page.locator("body").inner_text(timeout=10000)

        # Median pay
        mp = re.search(r"20\d{2} Median Pay\s+(\$[\d,]+\s+per\s+\w+)", table_text)
        if mp:
            result["median_pay"] = mp.group(1).strip()
        else:
            mp2 = re.search(r"\$([\d,]+)\s+per\s+year", table_text)
            if mp2:
                result["median_pay"] = mp2.group(0).strip()

        # Job outlook
        jo = re.search(r"Job Outlook,\s*\d{4}.\d{2,4}\s+(.+)", table_text)
        if jo:
            result["job_outlook"] = jo.group(1).strip()
        else:
            jo2 = re.search(r"(\d+%\s*\([^)]+\))", table_text)
            if jo2:
                result["job_outlook"] = jo2.group(1).strip()

        # Entry-level education
        edu = re.search(r"Typical Entry[- ]Level Education\s+(.+)", table_text)
        if edu:
            result["entry_level_education"] = edu.group(1).strip()

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nResults for '{occupation}':")
        print(f"  Median Pay:            {result['median_pay']}")
        print(f"  Job Outlook:           {result['job_outlook']}")
        print(f"  Entry-Level Education: {result['entry_level_education']}")

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
        info = run(playwright)
        print(f"\n--- Summary ---")
        for k, v in info.items():
            print(f"  {k}: {v}")
