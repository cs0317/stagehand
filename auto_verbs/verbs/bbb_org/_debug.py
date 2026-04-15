import os, sys, shutil
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

with sync_playwright() as p:
    port = get_free_port()
    profile_dir = get_temp_profile_dir("bbb_debug2")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = p.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    page.goto("https://www.bbb.org/search?find_text=Comcast")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(5000)
    text = page.evaluate("document.body.innerText") or ""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    print(f"Lines: {len(lines)}")
    for l in lines[:50]:
        print(l[:120])

    # Check profile links
    links_js = """
    JSON.stringify(
      Array.from(document.querySelectorAll('a'))
        .filter(a => a.href.includes('/profile/'))
        .slice(0, 5)
        .map(a => ({href: a.href, text: a.innerText.substring(0, 80)}))
    )
    """
    links = page.evaluate(links_js)
    print("\nProfile links:", links)

    browser.close()
    chrome_proc.terminate()
    shutil.rmtree(profile_dir, ignore_errors=True)
