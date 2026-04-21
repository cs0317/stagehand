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
    page.goto('https://www.overleaf.com/project/69e7ed741e7a36b3d5c15389', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(8000)

    # Try clicking New Folder
    cnt = page.locator('button[aria-label="New Folder"]').count()
    print('New Folder btn count:', cnt)
    if cnt > 0:
        page.locator('button[aria-label="New Folder"]').first.click()
    else:
        cnt2 = page.locator('button:has-text("create_new_folder")').count()
        print('Fallback btn count:', cnt2)
        page.locator('button:has-text("create_new_folder")').first.click()
    page.wait_for_timeout(2000)

    # Inspect the dialog
    r = page.evaluate('''() => {
        var dialogs = document.querySelectorAll('[role=dialog], .modal, .ReactModal__Content, form');
        var out = 'Dialogs/modals/forms: ' + dialogs.length + '\\n';
        for (var i = 0; i < dialogs.length; i++) {
            var d = dialogs[i];
            out += 'Dialog ' + i + ': tag=' + d.tagName + ' class=' + d.className.substring(0,80) + '\\n';
            out += '  innerHTML (first 800): ' + d.innerHTML.substring(0,800) + '\\n';
        }
        var btns = document.querySelectorAll('button');
        out += '\\nButtons with create/ok/submit/add/confirm:\\n';
        for (var j = 0; j < btns.length; j++) {
            var b = btns[j];
            var t = b.innerText.trim().toLowerCase();
            if (t.match(/create|ok|submit|add|confirm|save/)) {
                out += '  btn: text="' + b.innerText.trim() + '" disabled=' + b.disabled + ' visible=' + (b.offsetParent !== null) + '\\n';
            }
        }
        var inputs = document.querySelectorAll('input[type=text], input:not([type])');
        out += '\\nText inputs: ' + inputs.length + '\\n';
        for (var k = 0; k < inputs.length; k++) {
            var inp = inputs[k];
            out += '  input: placeholder="' + (inp.placeholder||'') + '" value="' + inp.value + '"\\n';
        }
        return out;
    }''')
    print(r)
    ctx.close()
