"""Debug: Web App - runtime stack options"""
from playwright.sync_api import sync_playwright
import os

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        os.path.join(os.environ['USERPROFILE'], 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default'),
        channel='chrome', headless=False, viewport=None,
        args=['--disable-blink-features=AutomationControlled', '--disable-infobars', '--disable-extensions', '--start-maximized'])
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto('https://portal.azure.com/', wait_until='domcontentloaded', timeout=60000)
    for _ in range(15):
        page.wait_for_timeout(2000)
        if 'portal.azure.com' in page.url and 'login' not in page.url:
            break
        if 'login.microsoftonline.com' in page.url:
            try:
                t = page.locator('[data-test-id="list-item-0"],.table[role="presentation"] .row,#tilesHolder .tile-container').first
                if t.count() > 0 and t.is_visible(timeout=2000):
                    t.click()
                    page.wait_for_timeout(3000)
            except:
                pass
    page.goto('https://portal.azure.com/#create/Microsoft.WebSite', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(20000)

    # Select RG
    rg = page.locator('[role="combobox"][aria-label*="Resource group"]').first
    rg.click(); page.wait_for_timeout(2000)
    page.locator('[role="dialog"] >> text="test-rg-001"').first.click()
    page.wait_for_timeout(1000)

    # Enter name
    name = page.locator('input[aria-label="Web App name"]').first
    name.click(); name.press('Control+a'); name.type('test-wapp-dbg1', delay=30)
    page.wait_for_timeout(10000)  # Wait for validation

    # Click runtime combobox
    rt = page.locator('[role="combobox"][aria-label="Runtime stack selector"]').first
    print(f'Runtime disabled: {rt.get_attribute("aria-disabled")}')
    print(f'Runtime text: {rt.inner_text(timeout=1000)}')
    rt.click()
    page.wait_for_timeout(3000)

    # Check ALL visible content after clicking
    print('\nVisible dialogs:')
    for d in page.locator('[role="dialog"]').all():
        try:
            if d.is_visible():
                print(f'  dialog: {repr(d.inner_text(timeout=2000)[:300])}')
        except:
            pass

    print('\nVisible popups:')
    for sel in ['[class*="popup"]', '[class*="Callout"]', '[class*="dropdown-popup"]']:
        for el in page.locator(sel).all():
            try:
                if el.is_visible():
                    txt = el.inner_text(timeout=1000)[:300]
                    if txt.strip():
                        print(f'  {sel}: {repr(txt)}')
            except:
                pass

    print('\nVisible listbox items:')
    for lb in page.locator('[role="listbox"]').all():
        try:
            if lb.is_visible():
                print(f'  listbox: {repr(lb.inner_text(timeout=2000)[:300])}')
        except:
            pass

    ctx.close()

    # Check each frame for grids and rows
    for i, f in enumerate(page.frames):
        grids = f.locator('[role="grid"]').all()
        rows = f.locator('[role="row"]').all()
        det_rows = f.locator('[data-automationid="DetailsRow"]').all()
        print(f'\n  Frame[{i}]: grids={len(grids)} rows={len(rows)} detailRows={len(det_rows)}')
        for j, row in enumerate(rows[:3]):
            try:
                txt = row.inner_text(timeout=1000).strip().replace('\n', ' | ')[:200]
                print(f'    row[{j}]: "{txt}"')
            except:
                pass

    # Look for the activity log grid specifically
    print('\n=== Activity log grid ===')
    for sel in ['div.fxc-gc-row', '.fxc-grid-cell', '[class*="fxc-gc"]', '[class*="fxc-grid"]']:
        try:
            els = page.locator(sel).all()
            vis = sum(1 for el in els if el.is_visible())
            print(f'  {sel}: {len(els)} total, {vis} visible')
            for el in els[:3]:
                if el.is_visible():
                    txt = el.inner_text(timeout=1000).strip().replace('\n', ' | ')[:200]
                    print(f'    text: "{txt}"')
        except:
            pass

    # Look at visible grids
    print('\n=== Visible grids ===')
    grids = page.locator('[role="grid"]').all()
    for i, grid in enumerate(grids):
        try:
            if grid.is_visible():
                rows = grid.locator('[role="row"]').all()
                aria = grid.get_attribute('aria-label') or ''
                print(f'  grid[{i}]: aria="{aria}" rows={len(rows)}')
                for j, row in enumerate(rows[:5]):
                    cells = row.locator('[role="gridcell"], [role="columnheader"]').all()
                    cell_texts = []
                    for c in cells:
                        try:
                            cell_texts.append(c.inner_text(timeout=500).strip()[:40])
                        except:
                            cell_texts.append('?')
                    print(f'    row[{j}] ({len(cells)} cells): {" | ".join(cell_texts)}')
        except:
            pass

    # Dump frame[0] text looking for activity-related lines
    print('\n=== Frame[0] activity lines ===')
    try:
        txt = page.locator('body').inner_text(timeout=5000)
        for line in txt.split('\n'):
            low = line.lower().strip()
            if any(w in low for w in ['succeeded', 'failed', 'accepted', 'started', 'write', 'delete', 'diagnostic', 'deploy']) and low:
                print(f'  "{line.strip()[:150]}"')
    except Exception as e:
        print(f'Error: {e}')

    ctx.close()

    ctx.close()
