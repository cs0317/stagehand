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

    # Use settings-widget-container as the section container
    r = page.evaluate('''() => {
        // Find the heading "Git authentication tokens" -> its settings-widget-container
        const headings = Array.from(document.querySelectorAll('h4'));
        let h4 = null;
        for (const h of headings) {
            if (h.innerText.toLowerCase().includes('git authentication')) {
                h4 = h;
                break;
            }
        }
        if (!h4) return 'No h4 found for git authentication';

        // Go up to settings-widget-container
        let widget = h4.closest('.settings-widget-container');
        if (!widget) widget = h4.parentElement.parentElement;

        const out = [];
        out.push('Widget: tagName=' + widget.tagName + ' class=' + (widget.className || ''));

        // All child elements
        const allEls = widget.querySelectorAll('*');
        out.push('Total elements in widget: ' + allEls.length);

        // All buttons anywhere in widget
        const buttons = widget.querySelectorAll('button, a[role=button], [type=submit]');
        out.push('\\nButtons (' + buttons.length + '):');
        buttons.forEach((btn, i) => {
            out.push('  btn' + i + ': tagName=' + btn.tagName + ' text="' + btn.innerText.trim().substring(0, 60) + '" type=' + (btn.type || '') + ' class=' + (btn.className || '').substring(0, 80) + ' data-ol-loading=' + (btn.getAttribute('data-ol-loading') || '') + ' aria-label=' + (btn.getAttribute('aria-label') || ''));
        });

        // All links
        const links = widget.querySelectorAll('a');
        out.push('\\nLinks (' + links.length + '):');
        links.forEach((a, i) => {
            out.push('  a' + i + ': text="' + a.innerText.trim().substring(0, 60) + '" href=' + (a.getAttribute('href') || '').substring(0, 80) + ' class=' + (a.className || '').substring(0, 60));
        });

        // Dump entire widget HTML
        out.push('\\n=== WIDGET HTML ===');
        out.push(widget.outerHTML.substring(0, 4000));

        return out.join('\\n');
    }''')
    print(r)

    ctx.close()
