import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

user_data_dir = os.path.join(os.environ['USERPROFILE'], 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir, channel='chrome', headless=False, viewport=None,
        args=['--disable-blink-features=AutomationControlled','--disable-infobars','--disable-extensions','--start-maximized'],
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto('https://www.overleaf.com/project', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(3000)

    # Find any project and open it
    links = page.locator('td a[href^="/project/"]')
    print('Project links:', links.count())
    if links.count() > 0:
        links.first.click()
        page.wait_for_timeout(8000)
        print('Opened:', page.url)

        # Click the title dropdown
        title_btn = page.locator('button[aria-label="Project title options"]')
        print('Title btn count:', title_btn.count())
        if title_btn.count() == 0:
            title_btn = page.locator('button:has-text("keyboard_arrow_down")')
            print('Fallback title btn count:', title_btn.count())
        title_btn.first.click()
        page.wait_for_timeout(1000)

        # Find Rename in the dropdown
        r = page.evaluate('''() => {
            var items = document.querySelectorAll('a, button, li, [role=menuitem]');
            var out = [];
            for (var i = 0; i < items.length; i++) {
                var el = items[i];
                var t = el.innerText.trim().toLowerCase();
                if (t.match(/rename|copy|download|word|pdf/)) {
                    out.push(el.tagName + ': "' + el.innerText.trim() + '" role=' + (el.getAttribute('role')||'') + ' class=' + el.className.substring(0,40));
                }
            }
            return out.join('\\n');
        }''')
        print('Menu items:\n' + r)

        # Click Rename
        rename = page.locator('a:has-text("Rename"), button:has-text("Rename")').first
        rename.click()
        page.wait_for_timeout(1500)

        # Now inspect what appeared - look for inputs, modals, etc.
        r2 = page.evaluate('''() => {
            var out = [];
            // Check for visible inputs
            var inputs = document.querySelectorAll('input');
            for (var i = 0; i < inputs.length; i++) {
                var inp = inputs[i];
                if (inp.offsetParent !== null || inp.offsetWidth > 0) {
                    out.push('input: type=' + (inp.type||'') + ' aria-label="' + (inp.getAttribute('aria-label')||'') + '" placeholder="' + (inp.placeholder||'') + '" value="' + inp.value.substring(0,50) + '" id=' + inp.id + ' class=' + inp.className.substring(0,60));
                }
            }
            // Check for modal/dialog
            var modals = document.querySelectorAll('[role=dialog], .modal.show');
            out.push('\\nModals: ' + modals.length);
            for (var j = 0; j < modals.length; j++) {
                out.push('Modal ' + j + ': ' + modals[j].innerHTML.substring(0, 600));
            }
            return out.join('\\n');
        }''')
        print('After Rename click:\n' + r2)

    ctx.close()
