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
    # Create a new blank document
    page.goto('https://docs.google.com/document/create', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(8000)
    print('URL:', page.url)
    print('Title:', page.title())

    # Get the document ID from URL
    url = page.url
    print('Doc URL:', url)

    # Explore the editor UI - menus
    r = page.evaluate('''() => {
        var out = [];
        // Menu bar items
        var menus = document.querySelectorAll('[role=menuitem], .menu-button, [id*=menu]');
        out.push('Menu items: ' + menus.length);
        var menuTexts = [];
        for (var i = 0; i < Math.min(30, menus.length); i++) {
            var t = menus[i].innerText.trim();
            var al = menus[i].getAttribute('aria-label') || '';
            if (t) menuTexts.push(t.substring(0,30));
        }
        out.push('Menu texts: ' + menuTexts.join(' | '));
        
        // Toolbar buttons
        var toolbtns = document.querySelectorAll('[role=toolbar] button, .goog-toolbar button, [aria-label]');
        var tbTexts = [];
        for (var j = 0; j < toolbtns.length; j++) {
            var al = toolbtns[j].getAttribute('aria-label') || '';
            if (al && al.length > 2) tbTexts.push(al.substring(0,40));
        }
        // Deduplicate
        tbTexts = [...new Set(tbTexts)];
        out.push('Toolbar aria-labels (' + tbTexts.length + '):');
        tbTexts.slice(0,30).forEach(function(t) { out.push('  ' + t); });
        
        // Document title input
        var titleInput = document.querySelector('input.docs-title-input, [aria-label*="title"], [aria-label*="Title"]');
        if (titleInput) {
            out.push('Title input: tag=' + titleInput.tagName + ' value="' + (titleInput.value || titleInput.innerText || '').substring(0,50) + '" aria="' + (titleInput.getAttribute('aria-label')||'') + '"');
        } else {
            out.push('No title input found');
        }
        
        // Share button
        var share = document.querySelector('[aria-label*="Share"], [aria-label*="share"]');
        if (share) out.push('Share btn: tag=' + share.tagName + ' aria="' + share.getAttribute('aria-label') + '"');
        
        return out.join('\\n');
    }''')
    print(r)
    
    # Also get the File menu contents
    # Click File menu
    file_menu = page.locator('#docs-file-menu, [aria-label="File"]').first
    if file_menu.count() > 0:
        file_menu.click()
        page.wait_for_timeout(1000)
        items = page.evaluate('''() => {
            var items = document.querySelectorAll('[role=menuitem]');
            return Array.from(items).slice(0,20).map(i => i.innerText.trim().substring(0,40)).join('\\n');
        }''')
        print('\\nFile menu items:\\n' + items)
        page.keyboard.press('Escape')
    
    ctx.close()
