import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

user_data_dir = os.path.join(os.environ['USERPROFILE'], 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir, channel='chrome', headless=False, viewport=None,
        args=['--disable-blink-features=AutomationControlled', '--disable-infobars', '--disable-extensions', '--start-maximized'],
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    # Create and name a doc
    page.goto('https://docs.google.com/document/create', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(8000)
    title = page.locator('input[aria-label="Rename"]').first
    title.click()
    page.wait_for_timeout(500)
    title.press('Control+a')
    title.type('Test Share Debug2', delay=30)
    title.press('Enter')
    page.wait_for_timeout(3000)

    # Click share
    share_btn = page.locator('div[aria-label*="Share"]').first
    share_btn.click()
    page.wait_for_timeout(4000)

    # Check for iframes
    iframes = page.frames
    print(f'Total frames: {len(iframes)}')
    for i, f in enumerate(iframes):
        print(f'  Frame {i}: name={f.name} url={f.url[:100]}')

    # Check if share dialog opened as a new page/popup
    print(f'Total pages: {len(ctx.pages)}')
    for i, p in enumerate(ctx.pages):
        print(f'  Page {i}: {p.url[:100]}')

    # Look for the share dialog content in each frame
    for i, f in enumerate(iframes):
        try:
            r = f.evaluate('''() => {
                const inputs = document.querySelectorAll('input');
                const btns = document.querySelectorAll('button, [role="button"]');
                const vis_btns = Array.from(btns).filter(b => b.offsetParent !== null);
                return 'inputs=' + inputs.length + ' buttons=' + vis_btns.length + 
                    ' inputAriaLabels=[' + Array.from(inputs).map(i => i.getAttribute('aria-label')||'').join(', ') + ']' +
                    ' buttonTexts=[' + vis_btns.slice(0,10).map(b => b.textContent.trim().substring(0,30)).join(', ') + ']';
            }''')
            print(f'  Frame {i} content: {r}')
        except Exception as e:
            print(f'  Frame {i} error: {str(e)[:80]}')

    ctx.close()
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

user_data_dir = os.path.join(os.environ['USERPROFILE'], 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir, channel='chrome', headless=False, viewport=None,
        args=['--disable-blink-features=AutomationControlled', '--disable-infobars', '--disable-extensions', '--start-maximized'],
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    # Create and name a doc first
    page.goto('https://docs.google.com/document/create', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(8000)
    title = page.locator('input[aria-label="Rename"]').first
    title.click()
    page.wait_for_timeout(500)
    title.press('Control+a')
    title.type('Test Share Debug', delay=30)
    title.press('Enter')
    page.wait_for_timeout(3000)
    print('URL:', page.url)

    # Open share dialog
    share_btn = page.locator('div[aria-label*="Share"]').first
    share_btn.click()
    page.wait_for_timeout(3000)

    # Check if "Name before sharing" dialog appeared
    skip_btn = page.locator('button:has-text("Skip")')
    if skip_btn.count() > 0 and skip_btn.first.is_visible():
        print('>> "Name before sharing" dialog detected, clicking Skip')
        skip_btn.first.click()
        page.wait_for_timeout(2000)

    # Dump what's visible now
    r = page.evaluate('''() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
        return btns.filter(b => b.offsetParent !== null).map(b =>
            b.tagName + ' text="' + b.textContent.trim().substring(0,50) + '" aria="' + (b.getAttribute('aria-label')||'') + '"'
        ).join('\\n');
    }''')
    print('Visible buttons BEFORE email:\\n' + r)

    # Type email
    email_input = page.locator('input[aria-label="Add people, groups, and calendar events"]').first
    if email_input.count() == 0:
        email_input = page.locator('input[type="text"]').first
    print('\\nEmail input found:', email_input.count() > 0)
    email_input.type('collaborator@example.com', delay=30)
    page.wait_for_timeout(2000)
    page.keyboard.press('Enter')
    page.wait_for_timeout(3000)

    # Dump buttons AFTER email
    r2 = page.evaluate('''() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
        return btns.filter(b => b.offsetParent !== null).map(b =>
            b.tagName + ' text="' + b.textContent.trim().substring(0,50) + '" aria="' + (b.getAttribute('aria-label')||'') + '"'
        ).join('\\n');
    }''')
    print('\\nVisible buttons AFTER email:\\n' + r2)

    # Check for Send/Share/Done specifically
    r3 = page.evaluate('''() => {
        const all = Array.from(document.querySelectorAll('*'));
        const relevant = all.filter(e => {
            if (e.offsetParent === null) return false;
            const t = (e.textContent || '').trim();
            return (t === 'Send' || t === 'Share' || t === 'Done') && e.children.length === 0;
        });
        return relevant.map(e => e.tagName + '.' + (e.className||'').substring(0,60) + ' text="' + e.textContent.trim() + '" parent=' + e.parentElement.tagName).join('\\n');
    }''')
    print('\\nSend/Share/Done leaf elements:\\n' + r3)

    ctx.close()
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

user_data_dir = os.path.join(os.environ['USERPROFILE'], 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir, channel='chrome', headless=False, viewport=None,
        args=['--disable-blink-features=AutomationControlled', '--disable-infobars', '--disable-extensions', '--start-maximized'],
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto('https://docs.google.com/document/create', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(8000)

    # Open share dialog
    share_btn = page.locator('div[aria-label*="Share"]').first
    share_btn.click()
    page.wait_for_timeout(3000)

    # Type email
    email_input = page.locator('input[aria-label="Add people, groups, and calendar events"]').first
    if email_input.count() == 0:
        email_input = page.locator('input[type="text"]').first
    email_input.type('collaborator@example.com', delay=30)
    page.wait_for_timeout(2000)
    page.keyboard.press('Enter')
    page.wait_for_timeout(3000)

    # Dump all visible buttons
    r = page.evaluate('''() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
        return btns.filter(b => b.offsetParent !== null).map(b =>
            b.tagName + ' text="' + b.textContent.trim().substring(0,50) + '" aria="' + (b.getAttribute('aria-label')||'') + '" disabled=' + b.disabled
        ).join('\\n');
    }''')
    print('Visible buttons:\\n' + r)

    # Dump dialog text content
    r2 = page.evaluate('''() => {
        // Look for the dialog/modal
        const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal, [class*="dialog"]');
        if (dialogs.length === 0) return 'No dialog found';
        return Array.from(dialogs).map(d => 'DIALOG: ' + d.innerText.substring(0, 500)).join('\\n---\\n');
    }''')
    print('\\nDialogs:\\n' + r2)

    ctx.close()
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

user_data_dir = os.path.join(os.environ['USERPROFILE'], 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir, channel='chrome', headless=False, viewport=None,
        args=['--disable-blink-features=AutomationControlled', '--disable-infobars', '--disable-extensions', '--start-maximized'],
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    # Create a test doc
    page.goto('https://docs.google.com/document/create', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(8000)

    # Open share dialog
    share_btn = page.locator('div[aria-label*="Share"]').first
    share_btn.click()
    page.wait_for_timeout(3000)

    # Type email
    email_input = page.locator('input[aria-label="Add people, groups, and calendar events"]').first
    if email_input.count() == 0:
        email_input = page.locator('input[type="text"]').first
    email_input.type('collaborator@example.com', delay=30)
    page.wait_for_timeout(2000)
    page.keyboard.press('Enter')
    page.wait_for_timeout(2000)

    # Dump all buttons in the dialog
    r = page.evaluate('''() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.filter(b => b.offsetParent !== null).map(b => 
            'text=' + b.textContent.trim().substring(0,50) + ' | aria=' + (b.getAttribute('aria-label')||'') + ' | disabled=' + b.disabled
        ).join('\\n');
    }''')
    print('Visible buttons:\n' + r)

    # Also check for any send/share/done buttons
    r2 = page.evaluate('''() => {
        const all = Array.from(document.querySelectorAll('button, [role="button"]'));
        const relevant = all.filter(e => {
            const t = (e.textContent || '').toLowerCase();
            return t.includes('send') || t.includes('share') || t.includes('done') || t.includes('notify');
        });
        return relevant.map(e => e.tagName + ' text=' + e.textContent.trim().substring(0,50) + ' visible=' + (e.offsetParent !== null) + ' disabled=' + e.disabled).join('\\n');
    }''')
    print('\nSend/Share/Done buttons:\n' + r2)

    ctx.close()
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

user_data_dir = os.path.join(os.environ['USERPROFILE'], 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir, channel='chrome', headless=False, viewport=None,
        args=['--disable-blink-features=AutomationControlled', '--disable-infobars', '--disable-extensions', '--start-maximized'],
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    # Navigate directly to the template doc we just created
    page.goto('https://docs.google.com/document/d/1i4OmOHhJXUI2nd46EslLpjxqqDz5jSt43itFA7Fls0o/edit', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(5000)
    
    # Find all inputs
    r = page.evaluate('''() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(i => 'type=' + (i.type||'') + ' aria=' + (i.getAttribute('aria-label')||'') + ' value=' + (i.value||'').substring(0,50) + ' id=' + (i.id||'')).join('\\n');
    }''')
    print('Inputs:\n' + r)
    
    # Check for title/rename elements
    r2 = page.evaluate('''() => {
        // Check for docs title input - in newer Google Docs it might be different
        const candidates = document.querySelectorAll('[class*="title"], [class*="rename"], [aria-label*="ename"], [aria-label*="itle"]');
        return Array.from(candidates).slice(0,10).map(e => e.tagName + ' aria=' + (e.getAttribute('aria-label')||'') + ' class=' + (e.className||'').toString().substring(0,80) + ' text=' + e.textContent.trim().substring(0,50)).join('\\n');
    }''')
    print('Title/rename elements:\n' + r2)
    
    # Look at the document title bar area specifically
    r3 = page.evaluate('''() => {
        const bar = document.querySelector('.docs-title-widget');
        if (bar) return 'docs-title-widget: ' + bar.outerHTML.substring(0, 800);
        // Try other known containers
        const bar2 = document.querySelector('#docs-title-widget');
        if (bar2) return 'docs-title-widget by id: ' + bar2.outerHTML.substring(0, 800);
        return 'No docs-title-widget found. Checking doc-title...';
    }''')
    print('Title bar:\n' + r3)
    
    ctx.close()
