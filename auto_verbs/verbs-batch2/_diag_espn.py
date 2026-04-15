"""Diagnose ESPN standings page."""
import os, sys, shutil, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

with sync_playwright() as pw:
    port = get_free_port(); pd = get_temp_profile_dir("espn_diag")
    cp = launch_chrome(pd, port); ws = wait_for_cdp_ws(port)
    br = pw.chromium.connect_over_cdp(ws)
    ctx = br.contexts[0]; page = ctx.pages[0] if ctx.pages else ctx.new_page()
    try:
        page.goto("https://www.espn.com/nba/standings")
        page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(5000)

        # Dismiss popups
        for sel in ['button#onetrust-accept-btn-handler', 'button:has-text("Accept")',
                     'button:has-text("Close")', 'button:has-text("No, thanks")']:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except: pass

        print(f"URL: {page.url}")

        # Check table structure
        for sel in ['table', 'table.Table', 'table tbody tr', 'div.standings',
                    'tr.Table__TR', '.Table__Scroller', 'section.standings']:
            c = page.locator(sel).count()
            if c > 0:
                print(f"\n{sel}: count={c}")
                for i in range(min(c, 3)):
                    txt = page.locator(sel).nth(i).inner_text(timeout=2000).strip()
                    print(f"  [{i}] {txt[:200]}")

        # Print first 2000 chars of page
        print(f"\n--- Body text (first 2000) ---")
        print(page.locator("main, body").first.inner_text(timeout=5000)[:2000])

    except Exception as e:
        import traceback; traceback.print_exc()
    finally:
        try: br.close()
        except: pass
        cp.terminate(); shutil.rmtree(pd, ignore_errors=True)
