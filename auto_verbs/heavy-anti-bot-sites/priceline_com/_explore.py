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

    # Try Google redirect approach to bypass bot detection
    page.goto('https://www.google.com/search?q=priceline+hotels+las+vegas', wait_until='domcontentloaded')
    page.wait_for_timeout(3000)

    priceline_link = page.locator('a[href*="priceline.com"]').first
    if priceline_link.count() > 0:
        href = priceline_link.get_attribute('href')
        print('Found Priceline link:', href)
        priceline_link.click()
        page.wait_for_timeout(10000)
        print('URL after click:', page.url)
        body = page.inner_text('body', timeout=5000)
        print('--- Body (first 3000 chars) ---')
        print(body[:3000])
    else:
        print('No Priceline link found on Google')
        # Try direct with longer wait
        page.goto('https://www.priceline.com/relax/in/3000015803/from/20250501/to/20250503/rooms/1', wait_until='domcontentloaded')
        page.wait_for_timeout(12000)
        print('URL:', page.url)
        body = page.inner_text('body', timeout=5000)
        print('--- Body (first 3000 chars) ---')
        print(body[:3000])

    ctx.close()
