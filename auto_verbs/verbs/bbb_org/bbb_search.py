"""
Auto-generated Playwright script (Python)
BBB.org – Business Profile Search
Query: Comcast

Generated on: 2026-04-15T20:20:16.579Z
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "Comcast",
) -> dict:
    print(f"  Query: {query}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("bbb_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        # ── Navigate to BBB and search ────────────────────────────────
        print("Searching BBB.org...")
        page.goto("https://www.bbb.org")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        # Accept cookies if banner appears
        try:
            accept_btn = page.locator("button:has-text('Accept All Cookies')")
            if accept_btn.count() > 0:
                accept_btn.first.click()
                page.wait_for_timeout(1000)
        except Exception:
            pass

        # Fill search via JS to bypass any overlay
        page.evaluate("""(q) => {
            const input = document.querySelector('input[name="find_text"], input[placeholder*="Find"]');
            if (input) {
                input.value = q;
                input.dispatchEvent(new Event('input', {bubbles: true}));
            }
        }""", query)
        page.wait_for_timeout(500)

        # Submit search form
        page.evaluate("""() => {
            const form = document.querySelector('form[action*="search"]');
            if (form) form.submit();
            else {
                const btn = document.querySelector('button[type="submit"]');
                if (btn) btn.click();
            }
        }""")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Search results: {page.url}")

        # Click first business result link
        profile_link = page.locator("a[href*='/profile/']").first
        profile_link.click(timeout=10000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Profile page: {page.url}")

        # ── Extract from MAIN tab ────────────────────────────────────
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        # Business name
        business_name = query
        for i, line in enumerate(lines):
            if "BUSINESS PROFILE" in line and i + 2 < len(lines):
                business_name = lines[i + 2]
                break

        # BBB Rating
        bbb_rating = "N/A"
        for i, line in enumerate(lines):
            if line == "BBB Rating" and i + 1 < len(lines):
                bbb_rating = lines[i + 1]
                break

        # Accreditation
        accredited = "N/A"
        for line in lines:
            if "NOT BBB Accredited" in line or "NOT a BBB Accredited" in line:
                accredited = "Not Accredited"
                break
            elif "BBB Accredited" in line and "NOT" not in line and "Find" not in line and "become" not in line.lower():
                accredited = "Accredited"
                break
        if accredited == "N/A":
            for line in lines:
                if "is NOT a BBB Accredited" in line:
                    accredited = "Not Accredited"
                    break
                elif "is a BBB Accredited" in line:
                    accredited = "Accredited"
                    break

        # ── Navigate to Reviews tab ───────────────────────────────────
        review_rating = "N/A"
        review_count = "N/A"
        try:
            # Build review URL from profile URL (strip addressId if present)
            profile_url = page.url.rstrip("/")
            if "/addressId/" in profile_url:
                profile_url = profile_url.split("/addressId/")[0]
            reviews_url = profile_url + "/customer-reviews"
            page.goto(reviews_url)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(5000)

            review_text = page.evaluate("document.body.innerText") or ""
            review_lines = [l.strip() for l in review_text.split("\n") if l.strip()]

            for i, line in enumerate(review_lines):
                if "Customer Review Ratings" in line:
                    # Next line should be the rating number
                    if i + 1 < len(review_lines):
                        m = re.match(r"^(\d+\.\d+)$", review_lines[i + 1])
                        if m:
                            review_rating = m.group(1) + "/5"
                    break

            for line in review_lines:
                m = re.search(r"Average of ([\d,]+) Customer Reviews", line)
                if m:
                    review_count = m.group(1)
                    break
        except Exception:
            pass

        # ── Navigate to Complaints tab ────────────────────────────────
        total_complaints = "N/A"
        try:
            # Navigate directly to complaints URL
            current_url = page.url.split("/customer-reviews")[0].split("#")[0].rstrip("/")
            if "/addressId/" in current_url:
                current_url = current_url.split("/addressId/")[0]
            complaints_url = current_url + "/complaints"
            page.goto(complaints_url)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(5000)

            complaint_text = page.evaluate("document.body.innerText") or ""
            for line in complaint_text.split("\n"):
                m = re.search(r"([\d,]+) total complaints", line)
                if m:
                    total_complaints = m.group(1)
                    break
        except Exception:
            pass

        result = {
            "business_name": business_name,
            "bbb_rating": bbb_rating,
            "accreditation": accredited,
            "customer_review_rating": review_rating,
            "review_count": review_count,
            "total_complaints": total_complaints,
        }

        # ── Print results ─────────────────────────────────────────────
        print(f"\nBBB Profile for {result['business_name']}:\n")
        print(f"  BBB Rating:            {result['bbb_rating']}")
        print(f"  Accreditation:         {result['accreditation']}")
        print(f"  Customer Review Rating: {result['customer_review_rating']}")
        print(f"  Number of Reviews:     {result['review_count']}")
        print(f"  Total Complaints:      {result['total_complaints']}")

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
        run(playwright)
