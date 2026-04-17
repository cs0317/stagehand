import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright.sync_api import sync_playwright
import subprocess, time, shutil

subprocess.call('taskkill /f /im chrome.exe', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)

port = get_free_port()
profile_dir = get_temp_profile_dir("quizlet")
chrome_proc = launch_chrome(profile_dir, port)
ws_url = wait_for_cdp_ws(port)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    page.goto('https://quizlet.com/search?query=AP+Biology&type=sets', wait_until='domcontentloaded')
    page.wait_for_timeout(10000)
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
    for sel in ['[class*="SetCard"]', '[class*="set-card"]', '[class*="SearchResult"]', '[class*="search-result"]', '[data-testid*="result"]']:
        els = page.locator(sel)
        if els.count() > 0:
            print(f'\n--- {sel}: {els.count()} matches ---')
            for i in range(min(els.count(), 3)):
                txt = els.nth(i).inner_text(timeout=3000).strip()
                lines = [l.strip() for l in txt.split('\n') if l.strip()]
                print(f'  [{i}] lines={lines[:10]}')

    # Dump body text snippet
    body = page.inner_text('body', timeout=5000)
    print('\n--- Body (first 4000 chars) ---')
    print(body[:4000])

    browser.close()

chrome_proc.terminate()
shutil.rmtree(profile_dir, ignore_errors=True)
