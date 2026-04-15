"""
Indeed – Salary Search
Search for salary data by job title and location.
Uses Playwright via CDP connection with the user's Chrome profile.
"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, job_title: str = "data scientist", location: str = "New York, NY") -> dict:
    print(f"  Job title: {job_title}"); print(f"  Location: {location}\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("indeed_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    result = {"average_salary": "N/A", "salary_range": "N/A", "top_companies": []}
    try:
        print("Loading Indeed salary page...")
        page.goto("https://www.indeed.com/career/salaries")
        page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass

        print(f'STEP 1: Search for "{job_title}" in "{location}"...')
        title_input = page.locator('input[name="q"], input[aria-label*="job title" i], input[placeholder*="job title" i]').first
        title_input.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); title_input.type(job_title, delay=50); page.wait_for_timeout(1000)

        loc_input = page.locator('input[name="l"], input[aria-label*="location" i], input[placeholder*="location" i]').first
        loc_input.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); loc_input.type(location, delay=50); page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        page.wait_for_timeout(2000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)

        print("STEP 2: Extract salary info...")
        try:
            avg_el = page.locator('[class*="salary-average"], [data-testid*="salary"], h1:has-text("$"), [class*="cmp-salary-amount"]').first
            result["average_salary"] = avg_el.inner_text(timeout=3000).strip()
        except Exception: pass
        try:
            range_el = page.locator('[class*="salary-range"], [class*="range"]').first
            result["salary_range"] = range_el.inner_text(timeout=3000).strip()
        except Exception: pass
        try:
            company_els = page.locator('[class*="company-name"], [data-testid*="company"]')
            for j in range(min(company_els.count(), 5)):
                c = company_els.nth(j).inner_text(timeout=2000).strip()
                if c: result["top_companies"].append(c)
        except Exception: pass

        print(f"\nSalary results for '{job_title}' in '{location}':")
        print(f"  Average: {result['average_salary']}")
        print(f"  Range: {result['salary_range']}")
        print(f"  Top companies: {', '.join(result['top_companies']) if result['top_companies'] else 'N/A'}")
    except Exception as e: import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)
    return result

if __name__ == "__main__":
    with sync_playwright() as playwright: run(playwright)
