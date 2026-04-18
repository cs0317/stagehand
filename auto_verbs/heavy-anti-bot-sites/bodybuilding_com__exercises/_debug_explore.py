import os, sys, shutil
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright.sync_api import sync_playwright
from playwright_debugger import checkpoint, run_with_debugger

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("bb_debug")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            # Try the workouts section
            page.goto("https://shop.bodybuilding.com/blogs/workouts", wait_until="domcontentloaded")
            page.wait_for_timeout(3000)
            print("=== WORKOUTS BLOG ===")
            print(f"Title: {page.title()}")
            print(f"URL: {page.url}")
            text = page.evaluate("document.body.innerText.slice(0, 2000)")
            print(text[:1000])
            
            # Check for chest-related content
            links = page.evaluate(r"""() => {
                const links = document.querySelectorAll('a');
                return Array.from(links).filter(a => {
                    const t = a.innerText.toLowerCase();
                    return t.includes('chest') || t.includes('exercise') || t.includes('workout');
                }).slice(0, 10).map(a => ({
                    text: a.innerText.trim().slice(0, 100),
                    href: a.href
                }));
            }""")
            print("=== RELEVANT LINKS ===")
            for l in links:
                print(l)
            
            # Also try the muscle group filter approach
            page.goto("https://shop.bodybuilding.com/blogs/workouts/tagged/chest", wait_until="domcontentloaded")
            page.wait_for_timeout(3000)
            print("\n=== CHEST WORKOUTS ===")
            print(f"Title: {page.title()}")
            print(f"URL: {page.url}")
            text2 = page.evaluate("document.body.innerText.slice(0, 2000)")
            print(text2[:1000])
            
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    run_with_debugger(test_func)
