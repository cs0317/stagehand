import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

user_data_dir = os.path.join(
    os.environ["USERPROFILE"],
    "AppData", "Local", "Google", "Chrome", "User Data", "Default",
)
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir, channel="chrome", headless=False, viewport=None,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--disable-extensions",
            "--start-maximized",
        ],
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("https://www.overleaf.com/project", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(3000)

    # Search for project
    si = page.locator('input[placeholder="Search in all projects\u2026"]').first
    si.click()
    page.wait_for_timeout(500)
    si.press("Control+a")
    si.type("My Paper 1", delay=50)
    page.wait_for_timeout(2000)

    # Select checkbox
    cb = page.locator('td input[type="checkbox"]').first
    cb.click()
    page.wait_for_timeout(1000)

    # Dump all buttons with tag/action/more in their text
    r = page.evaluate('''() => {
        var btns = Array.from(document.querySelectorAll('button'));
        var relevant = btns.filter(b => {
            var t = (b.textContent || '').trim().toLowerCase();
            return t.includes('tag') || t.includes('action') || t.includes('more') || t.includes('label') || t.includes('folder') || t.includes('move');
        });
        return relevant.map(b => 'id=' + (b.id||'') + ' class=' + (b.className||'').substring(0,60) + ' text=' + (b.textContent||'').trim().substring(0,40) + ' visible=' + (b.offsetParent !== null)).join('\\n');
    }''')
    print("Tag/Action buttons:\n" + r)

    # Check dropdown menu items
    r2 = page.evaluate('''() => {
        var items = Array.from(document.querySelectorAll('[role="menu"] li, [role="menu"] button, .dropdown-menu li'));
        return 'Dropdown items: ' + items.length + '\\n' + items.slice(0,10).map(i => i.tagName + ': ' + (i.textContent||'').trim().substring(0,50)).join('\\n');
    }''')
    print(r2)

    # Check visible short buttons (toolbar)
    r3 = page.evaluate('''() => {
        var all = Array.from(document.querySelectorAll('button'));
        var visible = all.filter(b => b.offsetParent !== null);
        var withIcon = visible.filter(b => (b.textContent||'').trim().length < 20);
        return 'Visible short buttons: ' + withIcon.slice(0,20).map(b => '"' + (b.textContent||'').trim() + '" id=' + (b.id||'')).join(' | ');
    }''')
    print(r3)

    # First check existing tags in sidebar
    r_tags = page.evaluate('''() => {
        var sidebar = Array.from(document.querySelectorAll('button, a'));
        var tagItems = sidebar.filter(e => {
            var parent = e.closest('nav, [role="navigation"], ul');
            var t = (e.textContent||'').trim();
            return t && t.length > 0 && t.length < 30 && !t.match(/^(Product|Solutions|New|All|Your|Shared|Archived|Trashed|Title|Owner|close|download|inbox|delete|label|More|clear|Sign)/i);
        });
        return tagItems.map(e => e.tagName + ': "' + (e.textContent||'').trim().substring(0,40) + '" vis=' + (e.offsetParent !== null)).join('\\n');
    }''')
    print("Sidebar items:\n" + r_tags)

    # Select checkbox
    cb = page.locator('td input[type="checkbox"]').first
    cb.click()
    page.wait_for_timeout(1000)

    # Click the "label" button in the toolbar
    label_btn = page.locator('#project-tools-more-dropdown:has-text("label")').first
    print("Clicking label button...")
    label_btn.click()
    page.wait_for_timeout(2000)

    # Check dropdown content
    r4 = page.evaluate('''() => {
        var menus = Array.from(document.querySelectorAll('.dropdown-menu'));
        var visible = menus.filter(m => m.offsetParent !== null || getComputedStyle(m).display !== 'none');
        var out = 'Visible dropdown menus: ' + visible.length + '\\n';
        visible.forEach((m, i) => {
            out += 'Menu ' + i + ' HTML:\\n' + m.innerHTML.substring(0, 2000) + '\\n';
        });
        return out;
    }''')
    print(r4)

    ctx.close()
