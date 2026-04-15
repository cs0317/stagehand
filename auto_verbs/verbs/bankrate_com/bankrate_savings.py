"""
Auto-generated Playwright script (Python)
Bankrate.com – Best Savings Rates
Max results: 5

Generated on: 2026-04-15T19:51:19.559Z
Recorded 2 browser interactions
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
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("bankrate_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading Bankrate best savings rates page...")
        page.goto("https://www.bankrate.com/banking/savings/best-high-yield-interests-savings-accounts/")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract savings accounts ──────────────────────────────────────
        print(f"Extracting up to {max_results} savings accounts...")

        # Parse page text for savings account data
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        seen_banks = set()
        i = 0
        while i < len(lines) and len(results) < max_results:
            line = lines[i]

            # Look for "APY as of" pattern which marks a savings account entry
            if "APY as of" in line:
                # APY is typically on the next line as "X.XX" then "%"
                apy = "N/A"
                for k in range(i + 1, min(i + 4, len(lines))):
                    m = re.match(r"^(\d+\.\d+)$", lines[k])
                    if m:
                        apy = m.group(1) + "%"
                        break

                # Min balance: look for "Min. balance for APY" then "$" then amount
                min_deposit = "N/A"
                for k in range(i + 1, min(i + 10, len(lines))):
                    if "Min. balance for APY" in lines[k]:
                        for j2 in range(k + 1, min(k + 4, len(lines))):
                            if lines[j2] == "$":
                                if j2 + 1 < len(lines):
                                    min_deposit = "$" + lines[j2 + 1].replace(",", "")
                                break
                        break

                # Bank name: search backward for the line right before "Add to compare"
                # In featured section: "Bank Name" → "Add to compare" → promo → ... → APY
                # In editorial section: "EDITOR'S PICK" → "Bank Name" → ... → APY
                bank_name = "N/A"
                for k in range(i - 1, max(0, i - 12), -1):
                    if lines[k] == "Add to compare" and k > 0:
                        bank_name = lines[k - 1]
                        break
                    if lines[k] in ("EDITOR'S PICK",) and k + 1 < len(lines):
                        bank_name = lines[k + 1]
                        break

                if bank_name != "N/A" and apy != "N/A" and bank_name not in seen_banks:
                    seen_banks.add(bank_name)
                    results.append({
                        "bank_name": bank_name,
                        "apy": apy,
                        "min_deposit": min_deposit,
                    })

            i += 1

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nFound {len(results)} savings account offers:\n")
        for i, offer in enumerate(results, 1):
            print(f"  {i}. {offer['bank_name']}")
            print(f"     APY: {offer['apy']}  Min deposit: {offer['min_deposit']}")
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
        print(f"\nTotal offers found: {len(items)}")
