"""
Auto-generated Playwright script (Python)
Carvana – Car Search
Query: Honda Civic   Max results: 5

Generated on: 2026-04-15T20:30:32.103Z
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "Honda Civic",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("carvana_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────
        print("Loading Carvana search results...")
        slug = query.lower().replace(" ", "-")
        search_url = f"https://www.carvana.com/cars/{slug}"
        page.goto(search_url)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract cars ──────────────────────────────────────────────
        print(f"Extracting up to {max_results} cars...")

        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        # Pattern: "YEAR Make Model" → trim → "XXk miles" → "$XX,XXX" → "$XXX/mo"
        i = 0
        while i < len(lines) and len(results) < max_results:
            # Match year + make + model line
            m = re.match(r"^(\d{4})\s+(.+)$", lines[i])
            if m and int(m.group(1)) >= 2000 and int(m.group(1)) <= 2030:
                year_model = lines[i]
                trim = "N/A"
                mileage = "N/A"
                price = "N/A"
                monthly = "N/A"

                # Look ahead for trim, mileage, price, monthly
                for k in range(i + 1, min(i + 8, len(lines))):
                    line = lines[k]
                    if re.match(r"^\d+k miles$", line):
                        mileage = line
                    elif re.match(r"^\$[\d,]+$", line) and price == "N/A":
                        price = line
                    elif re.match(r"^\$[\d,]+/mo$", line):
                        monthly = line
                    elif trim == "N/A" and k == i + 1 and not line.startswith("$") and "miles" not in line:
                        trim = line

                if price != "N/A":
                    results.append({
                        "year_model": year_model,
                        "trim": trim,
                        "mileage": mileage,
                        "price": price,
                        "monthly_payment": monthly,
                    })

            i += 1

        # ── Print results ─────────────────────────────────────────────
        print(f"\nFound {len(results)} cars:\n")
        for i, car in enumerate(results, 1):
            print(f"  {i}. {car['year_model']} — {car['trim']}")
            print(f"     Price: {car['price']}  Mileage: {car['mileage']}  Monthly: {car['monthly_payment']}")
            print()

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
        items = run(playwright)
        print(f"\nTotal cars found: {len(items)}")
