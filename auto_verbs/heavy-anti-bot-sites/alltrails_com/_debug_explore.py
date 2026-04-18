import os, sys, shutil
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

port = get_free_port()
profile_dir = get_temp_profile_dir("alltrails_debug")
chrome_proc = launch_chrome(profile_dir, port)
ws_url = wait_for_cdp_ws(port)

with sync_playwright() as pw:
    browser = pw.chromium.connect_over_cdp(ws_url)
    ctx = browser.contexts[0]
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    try:
        url = "https://www.alltrails.com/search?q=Yosemite%20National%20Park"
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        print("=== TITLE ===")
        print(page.title())
        print("=== URL ===")
        print(page.url)
        text = page.evaluate("document.body.innerText.slice(0, 4000)")
        print("=== BODY TEXT ===")
        print(text)
        # Check full HTML for bot detection
        html = page.evaluate("document.documentElement.outerHTML.slice(0, 3000)")
        print("=== HTML (first 3000) ===")
        print(html)
    finally:
        browser.close()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)
