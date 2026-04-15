"""
Auto-generated Playwright script (Python)
NerdWallet - Cash Back Credit Cards

Generated on: 2026-04-15T21:39:11.880Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    max_results: int = 5,
) -> list:
    print("  Cash Back Credit Cards\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("nerdwallet_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = "https://www.nerdwallet.com/best/credit-cards/cash-back"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Parse card listings
        # Pattern: 'Our pick for:' -> card name -> ... -> 'Annual fee' -> fee -> 'Rewards rate' -> rate -> 'Intro offer' -> bonus
        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]

            if line.startswith('Our pick for:'):
                category = line.replace('Our pick for: ', '')
                # Next non-utility line is the card name
                name = text_lines[i + 1] if i + 1 < len(text_lines) else 'N/A'

                annual_fee = 'N/A'
                rewards_rate = 'N/A'
                intro_offer = 'N/A'

                # Look ahead for details
                for j in range(i + 2, min(i + 30, len(text_lines))):
                    jline = text_lines[j]
                    # Stop at next card
                    if jline.startswith('Our pick for:'):
                        break
                    if jline == 'Annual fee' and j + 1 < len(text_lines):
                        annual_fee = text_lines[j + 1]
                    elif jline == 'Rewards rate' and j + 1 < len(text_lines):
                        rewards_rate = text_lines[j + 1]
                    elif jline == 'Intro offer' and j + 1 < len(text_lines):
                        intro_offer = text_lines[j + 1]

                results.append({
                    'name': name,
                    'category': category,
                    'annual_fee': annual_fee,
                    'rewards_rate': rewards_rate,
                    'intro_offer': intro_offer,
                })

            i += 1

        print("=" * 60)
        print("NerdWallet: Best Cash Back Credit Cards")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['name']}")
            print(f"   Category:    {r['category']}")
            print(f"   Annual Fee:  {r['annual_fee']}")
            print(f"   Rewards:     {r['rewards_rate']}")
            print(f"   Sign-up:     {r['intro_offer']}")

        print(f"\nFound {len(results)} cards")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        browser.close()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as pw:
        run(pw)