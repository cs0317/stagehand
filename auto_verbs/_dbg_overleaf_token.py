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
    page.goto('https://www.overleaf.com/user/settings', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(5000)
    print('URL:', page.url)

    # Click the Generate token button
    gen_btn = page.locator('button#generate-token-button')
    gen_btn.scroll_into_view_if_needed()
    page.wait_for_timeout(1000)
    gen_btn.click()
    page.wait_for_timeout(3000)

    # Check for dialog
    r = page.evaluate('''() => {
        const dialog = document.querySelector('[role="dialog"], .modal, .modal-dialog');
        if (!dialog) return 'No dialog found. Checking body for token text...\\n' + document.body.innerText.substring(0, 500);
        
        const out = [];
        out.push('Dialog found: tagName=' + dialog.tagName + ' class=' + (dialog.className || '').substring(0, 100));
        out.push('Dialog text: ' + dialog.innerText.trim().substring(0, 500));
        out.push('');
        
        // Find all elements that could contain the token
        const inputs = dialog.querySelectorAll('input, textarea, code, pre, [class*=token], span');
        out.push('Token-like elements (' + inputs.length + '):');
        inputs.forEach((el, i) => {
            const text = (el.value || el.innerText || el.textContent || '').trim();
            if (text.length > 10) {
                out.push('  el' + i + ': tagName=' + el.tagName + ' class=' + (el.className || '').substring(0, 60) + ' text/value=' + text.substring(0, 80));
            }
        });
        
        // Find buttons in dialog
        const buttons = dialog.querySelectorAll('button');
        out.push('\\nDialog buttons (' + buttons.length + '):');
        buttons.forEach((btn, i) => {
            out.push('  btn' + i + ': text="' + btn.innerText.trim() + '" class=' + (btn.className || '').substring(0, 60));
        });
        
        // Full dialog HTML
        out.push('\\n=== DIALOG HTML ===');
        out.push(dialog.outerHTML.substring(0, 3000));
        
        return out.join('\\n');
    }''')
    print(r)

    ctx.close()
