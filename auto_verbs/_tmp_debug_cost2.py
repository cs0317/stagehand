"""Debug: Web App - runtime stack interaction"""
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
    name.click(); name.press('Control+a'); name.type('test-wapp-dbg3', delay=30)
    page.wait_for_timeout(10000)

    # Examine the runtime combobox structure
    rt = page.locator('[role="combobox"][aria-label="Runtime stack selector"]').first
    print(f'Runtime tag: {rt.evaluate("e => e.tagName")}')
    print(f'Runtime aria-expanded: {rt.get_attribute("aria-expanded")}')
    print(f'Runtime aria-controls: {rt.get_attribute("aria-controls")}')
    html = rt.evaluate('e => e.outerHTML')
    print(f'HTML:\n{html[:600]}')

    # Try clicking with force
    print('\n--- Click with force ---')
    rt.click(force=True)
    page.wait_for_timeout(3000)
    print(f'aria-expanded: {rt.get_attribute("aria-expanded")}')

    # Check controlled element
    ctrl_id = rt.get_attribute('aria-controls')
    if ctrl_id:
        ctrl = page.locator(f'#{ctrl_id}')
        print(f'Controlled #{ctrl_id}: count={ctrl.count()}')
        if ctrl.count() > 0:
            vis = ctrl.first.is_visible()
            print(f'  visible: {vis}')
            if vis:
                print(f'  text: {repr(ctrl.first.inner_text(timeout=2000)[:400])}')

    # Check all visible dialogs
    for d in page.locator('[role="dialog"]').all():
        try:
            if d.is_visible():
                print(f'Dialog: {repr(d.inner_text(timeout=2000)[:300])}')
        except:
            pass

    # Try ArrowDown
    print('\n--- ArrowDown ---')
    rt.press('ArrowDown')
    page.wait_for_timeout(2000)
    print(f'aria-expanded: {rt.get_attribute("aria-expanded")}')
    if ctrl_id:
        ctrl = page.locator(f'#{ctrl_id}')
        if ctrl.count() > 0 and ctrl.first.is_visible():
            print(f'Controlled text: {repr(ctrl.first.inner_text(timeout=2000)[:400])}')

    ctx.close()
