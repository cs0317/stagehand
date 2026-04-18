import os, sys, shutil
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright.sync_api import sync_playwright
from playwright_debugger import checkpoint, run_with_debugger

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("ed_debug")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            # Try direct Edmunds review URL for 2024 Honda Civic
            page.goto("https://www.edmunds.com/honda/civic/2024/review/", wait_until="domcontentloaded")
            page.wait_for_timeout(5000)
            
            print("=== TITLE ===")
            print(page.title())
            print("=== URL ===")
            print(page.url)
            
            text = page.evaluate("document.body.innerText.slice(0, 4000)")
            print("=== BODY TEXT ===")
            print(text[:3000])
            
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    run_with_debugger(test_func)
