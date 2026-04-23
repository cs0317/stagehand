"""Debug: Web App - wait for runtime to enable"""
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

    # Select RG — wait for combobox to be visible first
    rg = page.locator('[role="combobox"][aria-label*="Resource group selector"]').first
    print(f'RG combobox count: {rg.count()}, visible: {rg.is_visible()}')
    rg.click(timeout=10000)
    page.wait_for_timeout(2000)
    rg_opt = page.locator('[role="dialog"] >> text="test-rg-001"').first
    if rg_opt.count() > 0 and rg_opt.is_visible(timeout=3000):
        rg_opt.click()
        print('Selected RG')
    else:
        print('RG option not found')
    page.wait_for_timeout(2000)

    # Enter name
    name = page.locator('input[aria-label="Web App name"]').first
    name.click(); name.press('Control+a'); name.type('test-wapp-uniquename99', delay=30)
    print('Entered name, waiting for validation...')

    # Check runtime status every 3 seconds for 60 seconds
    rt = page.locator('[role="combobox"][aria-label="Runtime stack selector"]').first
    for i in range(20):
        page.wait_for_timeout(3000)
        cls = rt.evaluate('e => e.className')
        disabled = 'azc-disabled' in cls
        text = rt.inner_text(timeout=1000).strip()
        print(f'  [{i*3}s] disabled={disabled}, text="{text}"')

        # Check for validation error
        errs = page.locator('[class*="error"], [class*="validation"], [aria-invalid="true"]').all()
        visible_errs = []
        for e in errs:
            try:
                if e.is_visible():
                    t = e.inner_text(timeout=500).strip()
                    if t and len(t) < 100:
                        visible_errs.append(t)
            except:
                pass
        if visible_errs:
            print(f'  Validation errors: {visible_errs[:3]}')

        if not disabled:
            print('  Runtime ENABLED!')
            rt.click()
            page.wait_for_timeout(2000)
            # Check dialog
            for d in page.locator('[role="dialog"]').all():
                try:
                    if d.is_visible():
                        print(f'  Dialog: {repr(d.inner_text(timeout=2000)[:400])}')
                except:
                    pass
            break

    ctx.close()
