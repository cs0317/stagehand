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

    # Now that we've already generated a token, check if the UI changed
    r = page.evaluate('''() => {
        // Find the git integration widget
        const headings = Array.from(document.querySelectorAll('h4'));
        let h4 = null;
        for (const h of headings) {
            if (h.innerText.toLowerCase().includes('git authentication')) {
                h4 = h;
                break;
            }
        }
        if (!h4) return 'No h4 found';
        
        let widget = h4.closest('.settings-widget-container');
        if (!widget) return 'No widget found';
        
        const out = [];
        out.push('Widget text: ' + widget.innerText.trim().substring(0, 1000));
        out.push('');
        
        // All buttons
        const buttons = widget.querySelectorAll('button');
        out.push('Buttons (' + buttons.length + '):');
        buttons.forEach((btn, i) => {
            out.push('  btn' + i + ': text="' + btn.innerText.trim() + '" id=' + (btn.id || '') + ' class=' + (btn.className || '').substring(0, 80));
        });
        
        // All links
        const links = widget.querySelectorAll('a');
        out.push('\\nLinks (' + links.length + '):');
        links.forEach((a, i) => {
            out.push('  a' + i + ': text="' + a.innerText.trim() + '" href=' + (a.getAttribute('href') || '') + ' class=' + (a.className || '').substring(0, 60));
        });
        
        // Token list
        const tokenItems = widget.querySelectorAll('table tr, [class*=token-list], [class*=token-row]');
        out.push('\\nToken items (' + tokenItems.length + '):');
        tokenItems.forEach((el, i) => {
            out.push('  item' + i + ': tagName=' + el.tagName + ' text=' + el.innerText.trim().substring(0, 80));
        });

        out.push('\\n=== WIDGET HTML ===');
        out.push(widget.outerHTML.substring(0, 4000));
        
        return out.join('\\n');
    }''')
    print(r)

    ctx.close()
