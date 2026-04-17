from playwright.sync_api import sync_playwright
import subprocess, time, os

subprocess.call('taskkill /f /im chrome.exe', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
ud = os.path.join(os.environ['USERPROFILE'], 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(ud, channel='chrome', headless=False, viewport=None, args=[
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--disable-extensions',
    ])
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto('https://quizlet.com/search?query=AP+Biology&type=sets', wait_until='domcontentloaded')
    page.wait_for_timeout(8000)
    print(f'URL: {page.url}')

    # Check flashcard links
    links = page.locator('a[href*="/flashcards/"]')
    print(f'\nFlashcard links: {links.count()}')
    for i in range(min(links.count(), 8)):
        a = links.nth(i)
        href = a.get_attribute('href') or ''
        txt = a.inner_text(timeout=3000).strip()
        print(f'  [{i}] href={href}')
        print(f'       text={repr(txt[:200])}')

    # Check broader result patterns
    for sel in ['[class*="SetCard"]', '[class*="set-card"]', '[class*="SearchResult"]', '[class*="search-result"]', '[data-testid*="result"]', '[class*="AssemblySet"]']:
        els = page.locator(sel)
        if els.count() > 0:
            print(f'\n--- {sel}: {els.count()} matches ---')
            for i in range(min(els.count(), 3)):
                txt = els.nth(i).inner_text(timeout=3000).strip()
                lines = [l.strip() for l in txt.split('\n') if l.strip()]
                print(f'  [{i}] lines={lines[:8]}')

    # Dump body text snippet
    body = page.inner_text('body', timeout=5000)
    print('\n--- Body (first 3000 chars) ---')
    print(body[:3000])

    ctx.close()
