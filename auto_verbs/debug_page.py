"""Quick debug helper: python debug_page.py <url>"""
import sys, shutil, os
os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, 'verbs')
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"
port = get_free_port()
pd = get_temp_profile_dir("debug")
cp = launch_chrome(pd, port)
ws = wait_for_cdp_ws(port)
with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp(ws)
    ctx = b.contexts[0]
    p = ctx.pages[0] if ctx.pages else ctx.new_page()
    p.goto(url, wait_until="domcontentloaded", timeout=30000)
    p.wait_for_timeout(8000)
    count = p.evaluate('() => document.querySelectorAll("h1,h2,h3,h4,article").length')
    print(f"h1-h4/article count: {count}")
    heads = p.evaluate('''() => Array.from(document.querySelectorAll("h1,h2,h3,h4")).slice(0,15).map(e => e.tagName + ": " + e.textContent.trim().substring(0,80)).join("\\n")''')
    print(heads)
    print("---links---")
    links = p.evaluate('''() => Array.from(document.querySelectorAll("a")).slice(0,10).map(e => e.textContent.trim().substring(0,60)).join("\\n")''')
    print(links)
    b.close()
    cp.terminate()
    shutil.rmtree(pd, ignore_errors=True)
