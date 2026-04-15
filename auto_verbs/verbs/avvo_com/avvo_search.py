"""
Auto-generated Playwright script (Python)
Avvo.com – Lawyer Search
Specialty: immigration
Location: Los Angeles, CA
Max results: 5

Generated on: 2026-04-15T19:47:19.492Z
Recorded 2 browser interactions
"""

import re
import os, sys, shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    specialty: str = "immigration",
    location: str = "Los Angeles, CA",
    max_results: int = 5,
) -> list:
    print(f"  Specialty: {specialty}")
    print(f"  Location: {location}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("avvo_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to search results ────────────────────────────────────
        search_url = f"https://www.avvo.com/search/lawyer_search?q={quote_plus(specialty)}&loc={quote_plus(location)}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract lawyers ───────────────────────────────────────────────
        print(f"Extracting up to {max_results} lawyers...")

        # Avvo lawyer cards are in div[class*=lawyer] containers
        # Parse the full text to extract structured data
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        i = 0
        while i < len(lines) and len(results) < max_results:
            line = lines[i]

            # Look for rating pattern (e.g. "4.8") followed by reviews (e.g. "47 reviews")
            if re.match(r"^\d+\.\d+$", line) and i + 1 < len(lines) and "review" in lines[i + 1].lower():
                rating = line
                reviews_text = lines[i + 1]
                reviews_m = re.search(r"(\d+)\s*reviews?", reviews_text)
                num_reviews = reviews_m.group(1) if reviews_m else "N/A"

                # Name is usually 1-2 lines before the rating
                name = "N/A"
                for k in range(max(0, i - 3), i):
                    candidate = lines[k]
                    # Name is typically a proper name (2-4 words, capitalized)
                    if (re.match(r"^[A-Z][a-z]", candidate)
                        and len(candidate.split()) >= 2
                        and len(candidate) < 50
                        and "PRO" not in candidate
                        and "SPONSORED" not in candidate
                        and "Save" not in candidate):
                        name = candidate

                # Years of experience: "Licensed for X years"
                years_exp = "N/A"
                for k in range(i, min(i + 8, len(lines))):
                    m = re.search(r"Licensed for (\d+) years?", lines[k])
                    if m:
                        years_exp = m.group(1) + " years"
                        break

                if name != "N/A":
                    results.append({
                        "name": name,
                        "rating": rating,
                        "years_experience": years_exp,
                        "num_reviews": num_reviews,
                    })

            i += 1

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nFound {len(results)} {specialty} lawyers in {location}:\n")
        for i, lawyer in enumerate(results, 1):
            print(f"  {i}. {lawyer['name']}")
            print(f"     Rating: {lawyer['rating']}  Reviews: {lawyer['num_reviews']}  Experience: {lawyer['years_experience']}")
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
        print(f"\nTotal lawyers found: {len(items)}")
