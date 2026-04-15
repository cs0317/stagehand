import os, sys, shutil
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

with sync_playwright() as p:
    port = get_free_port()
    pdir = get_temp_profile_dir("cb_debug")
    proc = launch_chrome(pdir, port)
    ws = wait_for_cdp_ws(port)
    br = p.chromium.connect_over_cdp(ws)
    ctx = br.contexts[0]
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    pg.goto("https://www.crateandbarrel.com/search?query=dining+table")
    pg.wait_for_load_state("domcontentloaded")
    pg.wait_for_timeout(10000)
    print(f"Title: {pg.title()}")
    text = pg.evaluate("document.body ? document.body.innerText : 'EMPTY'") or ""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    print(f"Lines: {len(lines)}")
    for l in lines[:60]:
        print(l[:140])
    br.close()
    proc.terminate()
    shutil.rmtree(pdir, ignore_errors=True)
