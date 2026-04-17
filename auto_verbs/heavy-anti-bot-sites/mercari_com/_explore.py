"""Explore Mercari search page DOM to find correct selectors."""
from playwright.sync_api import sync_playwright
import subprocess, time, os

subprocess.call('taskkill /f /im chrome.exe', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
ud = os.path.join(os.environ['USERPROFILE'], 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(ud, channel='chrome', headless=False, args=[
        '--disable-blink-features=AutomationControlled','--disable-infobars','--disable-extensions'])
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto('https://www.mercari.com/', wait_until='domcontentloaded')
    page.wait_for_timeout(15000)
    
    body = page.inner_text('body', timeout=5000)
    print(f'Homepage body length: {len(body)}')
    if 'security' in body.lower() or 'cloudflare' in body.lower():
        print('BLOCKED on homepage too. Waiting 15 more seconds...')
        page.wait_for_timeout(15000)
        body = page.inner_text('body', timeout=5000)
        print(f'After extra wait: {len(body)}')
    
    print(body[:1000])
    
    if len(body) > 500:
        # Try navigating to search from homepage
        print('\nNavigating to search...')
        page.goto('https://www.mercari.com/search/?keyword=Nintendo+Switch', wait_until='domcontentloaded')
        page.wait_for_timeout(10000)
        body2 = page.inner_text('body', timeout=5000)
        print(f'Search body length: {len(body2)}')
        print(body2[:1000])
    print('--- Body (first 2000) ---')
    print(body[:2000])
    print('--- end ---')

    # Check for item links
    item_links = page.locator('a[href*="/item/"]')
    print(f'\nItem links: {item_links.count()}')
    for i in range(min(3, item_links.count())):
        href = item_links.nth(i).get_attribute('href') or ''
        txt = item_links.nth(i).inner_text(timeout=2000).strip()[:200]
        print(f'  [{i}]: href={href[:80]} text={repr(txt)}')

    # Check data-testid elements
    testid_els = page.locator('[data-testid]')
    print(f'\nElements with data-testid: {testid_els.count()}')
    for i in range(min(20, testid_els.count())):
        tid = testid_els.nth(i).get_attribute('data-testid') or ''
        if any(kw in tid.lower() for kw in ['item', 'product', 'card', 'listing', 'search', 'result']):
            try:
                txt = testid_els.nth(i).inner_text(timeout=1000).strip()[:100]
                print(f'  [{i}]: {tid} -> {repr(txt)}')
            except:
                print(f'  [{i}]: {tid}')

    ctx.close()
