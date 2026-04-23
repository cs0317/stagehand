"""Debug: Web App - runtime stack open dialog"""
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
    page.wait_for_timeout(25000)

    # Select RG
    rg = page.locator('[role="combobox"][aria-label*="Resource group selector"]').first
    rg.click(timeout=10000); page.wait_for_timeout(2000)
    page.locator('[role="dialog"] >> text="test-rg-001"').first.click()
    page.wait_for_timeout(2000)

    # Enter name
    name = page.locator('input[aria-label="Web App name"]').first
    name.click(); name.press('Control+a'); name.type('test-wapp-xyzzy42', delay=30)
    page.wait_for_timeout(5000)

    # Click runtime combobox
    rt = page.locator('[role="combobox"][aria-label="Runtime stack selector"]').first
    print(f'Before: aria-expanded={rt.get_attribute("aria-expanded")}, disabled-class={"azc-disabled" in rt.evaluate("e => e.className")}')

    # Approach 1: Click
    rt.click()
    page.wait_for_timeout(2000)
    print(f'After click: aria-expanded={rt.get_attribute("aria-expanded")}')

    # Check dialog
    ctrl_id = rt.get_attribute('aria-controls')
    if ctrl_id:
        ctrl = page.locator(f'#{ctrl_id}')
        print(f'  Dialog visible: {ctrl.first.is_visible() if ctrl.count() > 0 else "N/A"}')

    # Approach 2: Space key
    rt.focus()
    page.wait_for_timeout(500)
    rt.press('Space')
    page.wait_for_timeout(2000)
    print(f'After Space: aria-expanded={rt.get_attribute("aria-expanded")}')
    if ctrl_id:
        ctrl = page.locator(f'#{ctrl_id}')
        if ctrl.count() > 0 and ctrl.first.is_visible():
            print(f'  Dialog: {repr(ctrl.first.inner_text(timeout=2000)[:400])}')

    # Approach 3: Enter key
    rt.press('Enter')
    page.wait_for_timeout(2000)
    print(f'After Enter: aria-expanded={rt.get_attribute("aria-expanded")}')
    if ctrl_id:
        ctrl = page.locator(f'#{ctrl_id}')
        if ctrl.count() > 0 and ctrl.first.is_visible():
            print(f'  Dialog: {repr(ctrl.first.inner_text(timeout=2000)[:400])}')

    # Approach 4: JavaScript dispatch
    rt.evaluate('e => e.click()')
    page.wait_for_timeout(2000)
    print(f'After JS click: aria-expanded={rt.get_attribute("aria-expanded")}')
    if ctrl_id:
        ctrl = page.locator(f'#{ctrl_id}')
        if ctrl.count() > 0 and ctrl.first.is_visible():
            print(f'  Dialog: {repr(ctrl.first.inner_text(timeout=2000)[:400])}')

    # Approach 5: dispatch mousedown+mouseup
    rt.evaluate("""e => {
        e.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
        e.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
        e.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    }""")
    page.wait_for_timeout(2000)
    print(f'After dispatch: aria-expanded={rt.get_attribute("aria-expanded")}')
    if ctrl_id:
        ctrl = page.locator(f'#{ctrl_id}')
        if ctrl.count() > 0 and ctrl.first.is_visible():
            print(f'  Dialog: {repr(ctrl.first.inner_text(timeout=2000)[:400])}')

    # Check if maybe the dropdown opened somewhere else
    print('\n--- All visible dialogs after attempts ---')
    for d in page.locator('[role="dialog"]').all():
        try:
            if d.is_visible():
                print(f'  {repr(d.inner_text(timeout=2000)[:200])}')
        except:
            pass
    for sel in ['[class*="popup"]:visible', '[class*="Callout"]:visible']:
        try:
            vis = page.locator(sel).all()
            for v in vis:
                txt = v.inner_text(timeout=1000)[:200]
                if txt.strip():
                    print(f'  {sel}: {repr(txt)}')
        except:
            pass

    ctx.close()
