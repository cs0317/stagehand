import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

user_data_dir = os.path.join(
    os.environ["USERPROFILE"],
    "AppData", "Local", "Google", "Chrome", "User Data", "Default",
)
# Use known project ID
PROJECT_ID = "69e7e793c4e4a724c0851151"

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
    page.goto(f"https://www.overleaf.com/project/{PROJECT_ID}", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    print("URL:", page.url)

    # Click Recompile
    recompile = page.locator('button:has-text("Recompile")').first
    if recompile.count() > 0:
        print("Clicking Recompile...")
        recompile.click()
        page.wait_for_timeout(15000)
        print("Recompile done")
    else:
        print("No Recompile button found")

    # Dump all buttons near the PDF toolbar
    r = page.evaluate("""() => {
        var btns = Array.from(document.querySelectorAll('button, a'));
        var relevant = btns.filter(b => {
            var t = (b.textContent || '').trim().toLowerCase();
            var aria = (b.getAttribute('aria-label') || '').toLowerCase();
            return t.includes('download') || t.includes('pdf') || t.includes('arrow_drop') || t.includes('output') || t.includes('recompile') ||
                   aria.includes('download') || aria.includes('pdf') || aria.includes('output') || aria.includes('toggle');
        });
        return relevant.map(b => {
            return 'tag=' + b.tagName + ' text="' + (b.textContent||'').trim().substring(0,50) + '" aria="' + (b.getAttribute('aria-label')||'') + '" href="' + (b.getAttribute('href')||'') + '" visible=' + (b.offsetParent !== null) + ' class="' + (b.className||'').substring(0,60) + '"';
        }).join(String.fromCharCode(10));
    }""")
    print("PDF/Download buttons:\\n" + r)

    # Also look for any dropdown menus that might be open
    r2 = page.evaluate("""() => {
        var menus = Array.from(document.querySelectorAll('[role="menu"], .dropdown-menu'));
        return 'Menus: ' + menus.length + menus.map((m, i) => {
            var items = Array.from(m.querySelectorAll('li, button, a'));
            return String.fromCharCode(10) + 'Menu ' + i + ': ' + items.map(it => (it.textContent||'').trim().substring(0,40)).join(' | ');
        }).join('');
    }""")
    print(r2)

    ctx.close()
