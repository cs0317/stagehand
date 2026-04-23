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
    page.goto('https://portal.azure.com/', wait_until='domcontentloaded', timeout=60000)
    for _ in range(30):
        page.wait_for_timeout(2000)
        url = page.url
        if 'portal.azure.com' in url and 'login' not in url and 'oauth' not in url:
            break
        if 'login.microsoftonline.com' in url:
            try:
                tile = page.locator('[data-test-id="list-item-0"], .table[role="presentation"] .row, #tilesHolder .tile-container').first
                if tile.count() > 0 and tile.is_visible(timeout=2000):
                    tile.click()
                    page.wait_for_timeout(3000)
            except Exception:
                pass
    page.wait_for_timeout(5000)

    page.goto('https://portal.azure.com/#create/Microsoft.StorageAccount-ARM', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(15000)

    form_frame = None
    for frame in page.frames:
        if 'reactblade' in frame.url and 'portal.azure' in frame.url:
            try:
                if frame.locator('[aria-label="Region"]').count() > 0:
                    form_frame = frame
                    break
            except Exception:
                pass
    print(f'Form frame: {form_frame is not None}')

    # Find ALL combobox elements
    print('\n=== All role="combobox" elements ===')
    comboboxes = form_frame.locator('[role="combobox"]').all()
    for i, cb in enumerate(comboboxes):
        try:
            vis = cb.is_visible()
            aria = cb.get_attribute('aria-label') or ''
            labelledby = cb.get_attribute('aria-labelledby') or ''
            text = cb.inner_text(timeout=500).strip()[:50]
            tag = cb.evaluate('el => el.tagName')
            print(f'  combobox[{i}]: tag={tag} vis={vis} aria-label="{aria}" aria-labelledby="{labelledby}" text="{text}"')
        except Exception as e:
            print(f'  combobox[{i}]: error={e}')

    # Find ALL ms-Dropdown elements
    print('\n=== All div.ms-Dropdown elements ===')
    dropdowns = form_frame.locator('div.ms-Dropdown').all()
    for i, dd in enumerate(dropdowns):
        try:
            vis = dd.is_visible()
            aria = dd.get_attribute('aria-label') or ''
            labelledby = dd.get_attribute('aria-labelledby') or ''
            text = dd.inner_text(timeout=500).strip()[:50]
            role = dd.get_attribute('role') or ''
            print(f'  dropdown[{i}]: vis={vis} role="{role}" aria-label="{aria}" labelledby="{labelledby}" text="{text}"')
        except Exception as e:
            print(f'  dropdown[{i}]: error={e}')

    # Now click the RG combobox (likely the 2nd combobox) and check options
    print('\n=== Clicking 2nd combobox (Resource group) ===')
    rg_cb = comboboxes[1] if len(comboboxes) > 1 else None
    if rg_cb:
        rg_cb.click()
        page.wait_for_timeout(3000)
        opts = form_frame.locator('[role="option"]').all()
        print(f'Options: {len(opts)}')
        for i, opt in enumerate(opts[:10]):
            txt = opt.inner_text(timeout=300).strip()[:60]
            print(f'  option[{i}]: "{txt}"')

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
    page.goto('https://portal.azure.com/', wait_until='domcontentloaded', timeout=60000)
    for _ in range(30):
        page.wait_for_timeout(2000)
        url = page.url
        if 'portal.azure.com' in url and 'login' not in url and 'oauth' not in url:
            break
        if 'login.microsoftonline.com' in url:
            try:
                tile = page.locator('[data-test-id="list-item-0"], .table[role="presentation"] .row, #tilesHolder .tile-container').first
                if tile.count() > 0 and tile.is_visible(timeout=2000):
                    tile.click()
                    page.wait_for_timeout(3000)
            except Exception:
                pass
    page.wait_for_timeout(5000)

    page.goto('https://portal.azure.com/#create/Microsoft.StorageAccount-ARM', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(15000)

    form_frame = None
    for frame in page.frames:
        if 'reactblade' in frame.url and 'portal.azure' in frame.url:
            try:
                if frame.locator('[aria-label="Region"]').count() > 0:
                    form_frame = frame
                    break
            except Exception:
                pass
    print(f'Form frame: {form_frame is not None}')

    # Dump the Subscription dropdown state
    sub_dd = form_frame.locator('[aria-label="Subscriptions"]').first
    print(f'\nSubscription dropdown: count={sub_dd.count()}, tag={sub_dd.evaluate("el=>el.tagName") if sub_dd.count()>0 else "N/A"}')
    if sub_dd.count() > 0:
        sub_text = sub_dd.inner_text(timeout=1000).strip()
        print(f'  Current text: "{sub_text}"')
        role = sub_dd.get_attribute('role') or ''
        print(f'  role: "{role}"')
        # Get the full outer HTML (first 500 chars)
        html = sub_dd.evaluate('el => el.outerHTML')[:500]
        print(f'  HTML: {html}')

    # Dump the RG dropdown state
    rg_dd = form_frame.locator('[aria-label="Resource group"]').first
    print(f'\nRG dropdown: count={rg_dd.count()}, tag={rg_dd.evaluate("el=>el.tagName") if rg_dd.count()>0 else "N/A"}')
    if rg_dd.count() > 0:
        rg_text = rg_dd.inner_text(timeout=1000).strip()
        print(f'  Current text: "{rg_text}"')
        role = rg_dd.get_attribute('role') or ''
        print(f'  role: "{role}"')
        html = rg_dd.evaluate('el => el.outerHTML')[:500]
        print(f'  HTML: {html}')

    # Try clicking the RG dropdown and check what appears
    print('\n=== Clicking RG dropdown ===')
    rg_dd.click()
    page.wait_for_timeout(3000)
    
    # Check for options anywhere in the frame
    opts = form_frame.locator('[role="option"]')
    print(f'Options after click: {opts.count()}')
    
    # Check for listbox
    listbox = form_frame.locator('[role="listbox"]')
    print(f'Listbox: {listbox.count()}')
    if listbox.count() > 0:
        lb_html = listbox.first.evaluate('el => el.outerHTML')[:500]
        print(f'  Listbox HTML: {lb_html}')
    
    # Check for any popup/dropdown that appeared
    for sel in ['.ms-Callout', '.ms-Layer', '[class*="dropdown"]', '[class*="Dropdown"]', '[class*="listbox"]', '[class*="popup"]']:
        loc = form_frame.locator(sel)
        if loc.count() > 0:
            vis = any(loc.nth(i).is_visible() for i in range(loc.count()))
            print(f'  {sel}: count={loc.count()} anyVisible={vis}')

    # Try Escape and then look for a different way to interact
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)

    # Maybe the RG dropdown is inside a specific section - get the parent area HTML
    print('\n=== RG section HTML ===')
    try:
        # Get parent elements around the RG dropdown
        parent_html = rg_dd.evaluate('''el => {
            let p = el.parentElement;
            for (let i = 0; i < 3; i++) {
                if (p.parentElement) p = p.parentElement;
            }
            return p.outerHTML;
        }''')
        print(parent_html[:1500])
    except Exception as e:
        print(f'Error: {e}')

    ctx.close()
import sys, os, random
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

user_data_dir = os.path.join(os.environ['USERPROFILE'], 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir, channel='chrome', headless=False, viewport=None,
        args=['--disable-blink-features=AutomationControlled', '--disable-infobars', '--disable-extensions', '--start-maximized'],
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto('https://portal.azure.com/', wait_until='domcontentloaded', timeout=60000)
    for _ in range(30):
        page.wait_for_timeout(2000)
        url = page.url
        if 'portal.azure.com' in url and 'login' not in url and 'oauth' not in url:
            break
        if 'login.microsoftonline.com' in url:
            try:
                tile = page.locator('[data-test-id="list-item-0"], .table[role="presentation"] .row, #tilesHolder .tile-container').first
                if tile.count() > 0 and tile.is_visible(timeout=2000):
                    print('  Clicking account...')
                    tile.click()
                    page.wait_for_timeout(3000)
            except Exception:
                pass
    page.wait_for_timeout(5000)

    # Navigate to create storage account
    page.goto('https://portal.azure.com/#create/Microsoft.StorageAccount-ARM', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(15000)

    # Find form iframe
    form_frame = None
    for frame in page.frames:
        if 'reactblade' in frame.url and 'portal.azure' in frame.url:
            try:
                if frame.locator('[aria-label="Region"]').count() > 0:
                    form_frame = frame
                    break
            except Exception:
                pass
    print(f'Form frame found: {form_frame is not None}')

    # Select resource group (test-rg-001 should exist now)
    rg_dropdown = form_frame.locator('[aria-label*="Resource group"]').first
    rg_dropdown.click()
    page.wait_for_timeout(1000)
    options = form_frame.locator('[role="option"]').all()
    print(f'RG options: {len(options)}')
    for opt in options[:10]:
        try:
            txt = opt.inner_text(timeout=300).strip()
            print(f'  option: "{txt}"')
        except Exception:
            pass
    rg_option = form_frame.locator('[role="option"]:has-text("test-rg-001")').first
    if rg_option.count() > 0:
        rg_option.click()
        print('Selected test-rg-001')
    else:
        print('test-rg-001 NOT found in dropdown!')
        page.keyboard.press('Escape')
    page.wait_for_timeout(500)

    # Fill storage account name
    sa_name = 'teststorage' + str(random.randint(10000, 99999))
    text_inputs = form_frame.locator('input[type="text"]').all()
    visible_text_inputs = []
    for ti in text_inputs:
        try:
            if ti.is_visible():
                visible_text_inputs.append(ti)
        except Exception:
            pass
    print(f'\nVisible text inputs: {len(visible_text_inputs)}')
    for i, ti in enumerate(visible_text_inputs):
        aria = ti.get_attribute('aria-label') or ''
        val = ti.input_value(timeout=300)
        print(f'  input[{i}]: aria="{aria}" value="{val}"')

    # The storage account name input should be the first visible text input
    name_input = visible_text_inputs[0]
    name_input.click()
    page.wait_for_timeout(300)
    name_input.press('Control+a')
    name_input.type(sa_name, delay=30)
    page.wait_for_timeout(500)
    print(f'\nEntered name: {sa_name}')

    # Check what the input value is now
    val_after = name_input.input_value(timeout=300)
    print(f'Input value after typing: "{val_after}"')

    # Check region
    region_dropdown = form_frame.locator('[aria-label="Region"]').first
    region_text = region_dropdown.inner_text(timeout=1000).strip()
    print(f'Current region: "{region_text}"')

    # Click Review + create
    review_btn = form_frame.locator('button:has-text("Review + create")').first
    review_btn.click()
    page.wait_for_timeout(8000)  # Extra wait to see validation errors

    # Check for validation errors
    print('\n=== After Review + create (8s wait) ===')
    # Look for error messages
    for sel in ['[role="alert"]', '.ms-MessageBar--error', '[class*="error"]', '[class*="Error"]', '.fxc-validation', '[class*="validation"]']:
        try:
            loc = form_frame.locator(sel)
            cnt = loc.count()
            if cnt > 0:
                for i in range(min(cnt, 5)):
                    el = loc.nth(i)
                    if el.is_visible():
                        txt = el.inner_text(timeout=500).strip()[:100]
                        print(f'  {sel}[{i}]: "{txt}"')
        except Exception:
            pass

    # Also check all visible text that contains "error" or "invalid" or "failed"
    try:
        body_text = form_frame.locator('body').inner_text(timeout=5000)
        for line in body_text.split('\n'):
            line = line.strip()
            if any(w in line.lower() for w in ['error', 'invalid', 'failed', 'validation', 'already exists', 'not available']):
                print(f'  ERROR TEXT: "{line[:100]}"')
    except Exception:
        pass

    # List all visible buttons now
    print('\n=== Visible buttons after Review+create ===')
    btns = form_frame.locator('button').all()
    for btn in btns:
        try:
            if btn.is_visible():
                txt = btn.inner_text(timeout=300).strip()
                disabled = btn.get_attribute('disabled')
                aria_disabled = btn.get_attribute('aria-disabled')
                if txt and len(txt) < 40:
                    print(f'  button: "{txt}" disabled={disabled} aria-disabled={aria_disabled}')
        except Exception:
            pass

    # Check if we're on the Review tab or still on Basics
    print('\n=== Tab/step indicators ===')
    for sel in ['[aria-selected="true"]', '.is-selected', '[class*="active"]']:
        try:
            loc = form_frame.locator(sel)
            for i in range(loc.count()):
                el = loc.nth(i)
                txt = el.inner_text(timeout=300).strip()[:50]
                if txt:
                    print(f'  {sel}: "{txt}"')
        except Exception:
            pass

    # Now look for the Create button
    print('\n=== Looking for Create button ===')
    for frame in page.frames:
        if not ('reactblade' in frame.url and 'portal.azure' in frame.url):
            continue
        for btn in frame.locator('button').all():
            try:
                txt = btn.inner_text(timeout=500).strip()
                if txt == 'Create' and btn.is_visible():
                    disabled = btn.get_attribute('disabled')
                    aria_disabled = btn.get_attribute('aria-disabled')
                    print(f'  Found "Create" button: disabled={disabled} aria-disabled={aria_disabled}')
            except Exception:
                continue

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
    page.goto('https://portal.azure.com/', wait_until='domcontentloaded', timeout=60000)
    for _ in range(30):
        page.wait_for_timeout(2000)
        url = page.url
        if 'portal.azure.com' in url and 'login' not in url and 'oauth' not in url:
            break
        if 'login.microsoftonline.com' in url:
            try:
                tile = page.locator('[data-test-id="list-item-0"], .table[role="presentation"] .row, #tilesHolder .tile-container').first
                if tile.count() > 0 and tile.is_visible(timeout=2000):
                    print('  Clicking account...')
                    tile.click()
                    page.wait_for_timeout(3000)
            except Exception:
                pass
    page.wait_for_timeout(5000)
    print(f'Home URL: {page.url}')

    # Navigate to create storage account
    page.goto('https://portal.azure.com/#create/Microsoft.StorageAccount-ARM', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(15000)
    print(f'Create URL: {page.url}')

    # Find form iframe
    form_frame = None
    for frame in page.frames:
        if 'reactblade' in frame.url and 'portal.azure' in frame.url:
            try:
                if frame.locator('[aria-label="Region"]').count() > 0:
                    form_frame = frame
                    break
            except Exception:
                pass
    print(f'Form frame found: {form_frame is not None}')

    if form_frame:
        # Click the RG dropdown
        rg_dropdown = form_frame.locator('[aria-label*="Resource group"]').first
        print(f'RG dropdown found: {rg_dropdown.count() > 0}')
        rg_dropdown.click()
        page.wait_for_timeout(1000)
        
        # List all options
        options = form_frame.locator('[role="option"]').all()
        print(f'RG options: {len(options)}')
        for opt in options[:10]:
            try:
                txt = opt.inner_text(timeout=300).strip()
                print(f'  option: "{txt}"')
            except Exception:
                pass
        
        # Check for test-rg-001
        rg_option = form_frame.locator('[role="option"]:has-text("test-rg-001")').first
        print(f'test-rg-001 found: {rg_option.count() > 0}')
        
        # Escape dropdown
        page.keyboard.press('Escape')
        page.wait_for_timeout(500)
        
        # Find and click "Create new" button
        create_new_btn = form_frame.locator('button:has-text("Create new")').first
        print(f'Create new btn found: {create_new_btn.count() > 0}, visible: {create_new_btn.is_visible() if create_new_btn.count() > 0 else False}')
        create_new_btn.click()
        page.wait_for_timeout(2000)
        
        # Dump the dialog structure
        print('\n=== After clicking Create new ===')
        # Look for dialog
        dialog = form_frame.locator('div[role="dialog"]')
        print(f'Dialog found: {dialog.count() > 0}')
        
        # Look for all visible inputs
        inputs = form_frame.locator('input').all()
        for inp in inputs:
            try:
                if inp.is_visible():
                    aria = inp.get_attribute('aria-label') or ''
                    typ = inp.get_attribute('type') or ''
                    val = inp.input_value(timeout=300)
                    ph = inp.get_attribute('placeholder') or ''
                    print(f'  Visible input: type="{typ}" aria="{aria}" placeholder="{ph}" value="{val}"')
            except Exception:
                pass
        
        # Look for all visible buttons
        btns = form_frame.locator('button').all()
        for btn in btns:
            try:
                if btn.is_visible():
                    txt = btn.inner_text(timeout=300).strip()
                    if txt and len(txt) < 30:
                        print(f'  Visible button: "{txt}"')
            except Exception:
                pass
        
        # Try to find the Name input specifically
        name_input = form_frame.locator('input[aria-label="Name"]').first
        print(f'\nName input (aria-label="Name"): count={name_input.count()}')
        
        # Try dialog input
        dialog_input = form_frame.locator('div[role="dialog"] input[type="text"]').first
        print(f'Dialog text input: count={dialog_input.count()}')
        
        # Try any input near "Create new"
        # Let's dump all text near the dialog
        try:
            dialog_html = dialog.first.inner_html(timeout=2000)[:500]
            print(f'\nDialog HTML: {dialog_html}')
        except Exception as e:
            print(f'Dialog HTML error: {e}')
        
        # Try a broader search - any input that appeared after clicking Create new
        all_text_inputs = form_frame.locator('input[type="text"]').all()
        print(f'\nAll text inputs: {len(all_text_inputs)}')
        for i, ti in enumerate(all_text_inputs):
            try:
                vis = ti.is_visible()
                aria = ti.get_attribute('aria-label') or ''
                val = ti.input_value(timeout=300)
                print(f'  text input[{i}]: visible={vis} aria="{aria}" value="{val}"')
            except Exception:
                pass

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
    page.goto('https://portal.azure.com/', wait_until='domcontentloaded', timeout=60000)
    for _ in range(30):
        page.wait_for_timeout(2000)
        url = page.url
        if 'portal.azure.com' in url and 'login' not in url and 'oauth' not in url:
            break
        if 'login.microsoftonline.com' in url:
            try:
                tile = page.locator('[data-test-id="list-item-0"], .table[role="presentation"] .row, #tilesHolder .tile-container').first
                if tile.count() > 0 and tile.is_visible(timeout=2000):
                    print('  Clicking account...')
                    tile.click()
                    page.wait_for_timeout(3000)
            except Exception:
                pass
    page.wait_for_timeout(5000)
    print(f'Home URL: {page.url}')

    # Navigate to create storage account
    page.goto('https://portal.azure.com/#create/Microsoft.StorageAccount-ARM', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(15000)
    print(f'Create URL: {page.url}')

    # Dump all frames
    print(f'\nFrames: {len(page.frames)}')
    for i, frame in enumerate(page.frames):
        print(f'  frame[{i}]: {frame.url[:120]}')

    # Look for inputs in ALL frames
    print('\n=== Inputs in all frames ===')
    for i, frame in enumerate(page.frames):
        try:
            inputs = frame.locator('input, [role="combobox"]').all()
            visible = [inp for inp in inputs if inp.is_visible()]
            if visible:
                print(f'  frame[{i}] ({frame.url[:60]}): {len(visible)} visible inputs')
                for inp in visible[:10]:
                    try:
                        aria = inp.get_attribute('aria-label') or ''
                        typ = inp.get_attribute('type') or ''
                        ph = inp.get_attribute('placeholder') or ''
                        tag = inp.evaluate('el => el.tagName')
                        print(f'    <{tag}> type="{typ}" aria="{aria}" placeholder="{ph}"')
                    except Exception:
                        pass
        except Exception:
            pass

    # Also look for Storage account name text specifically
    print('\n=== Looking for "Storage account name" in all frames ===')
    for i, frame in enumerate(page.frames):
        try:
            loc = frame.locator('text="Storage account name"')
            if loc.count() > 0:
                print(f'  frame[{i}]: found "Storage account name" text (count={loc.count()})')
        except Exception:
            pass

    # Look for any buttons with "Review" or "Create" text
    print('\n=== Buttons in all frames ===')
    for i, frame in enumerate(page.frames):
        try:
            btns = frame.locator('button').all()
            vis_btns = [b for b in btns if b.is_visible()]
            if vis_btns:
                btn_texts = []
                for b in vis_btns[:20]:
                    try:
                        txt = b.inner_text(timeout=300).strip()[:40]
                        if txt:
                            btn_texts.append(txt)
                    except Exception:
                        pass
                if btn_texts:
                    print(f'  frame[{i}]: {btn_texts}')
        except Exception:
            pass

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
    page.goto('https://portal.azure.com/', wait_until='domcontentloaded', timeout=60000)
    for _ in range(30):
        page.wait_for_timeout(2000)
        url = page.url
        if 'portal.azure.com' in url and 'login' not in url and 'oauth' not in url:
            break
        if 'login.microsoftonline.com' in url:
            try:
                tile = page.locator('[data-test-id="list-item-0"], .table[role="presentation"] .row, #tilesHolder .tile-container').first
                if tile.count() > 0 and tile.is_visible(timeout=2000):
                    print('  Clicking account...')
                    tile.click()
                    page.wait_for_timeout(3000)
            except Exception:
                pass
    page.wait_for_timeout(15000)
    print(f'URL: {page.url}')

    # Click Cloud Shell
    shell_btn = page.locator('a[aria-label="Cloud Shell"], a[title="Cloud Shell"]').first
    shell_btn.wait_for(state='visible', timeout=15000)
    shell_btn.click()
    page.wait_for_timeout(5000)
    print('Cloud Shell clicked.')

    # Find console iframe and click Bash
    for frame in page.frames:
        if 'console.azure.com' in frame.url:
            try:
                bash_btn = frame.locator('button:has-text("Bash")').first
                if bash_btn.is_visible(timeout=5000):
                    bash_btn.click()
                    print('Clicked Bash.')
                    break
            except Exception:
                pass

    # Wait for Cloud Shell to load
    page.wait_for_timeout(10000)

    # Find console iframe
    console_frame = None
    for frame in page.frames:
        if 'console.azure.com' in frame.url:
            console_frame = frame
            break
    print(f'Console frame: {console_frame is not None}')

    # Look for subscription dropdown and select it
    print('\n=== Looking for subscription dropdown ===')
    # Dump all dropdowns / selects / comboboxes
    for sel in ['select', '[role="combobox"]', '[role="listbox"]', '.ms-Dropdown', 'button.ms-Dropdown', '[class*="Dropdown"]']:
        try:
            loc = console_frame.locator(sel)
            cnt = loc.count()
            if cnt > 0:
                for i in range(cnt):
                    el = loc.nth(i)
                    vis = el.is_visible()
                    aria = el.get_attribute('aria-label') or ''
                    txt = el.inner_text(timeout=300).strip()[:50]
                    cls = el.get_attribute('class') or ''
                    print(f"  {sel}[{i}]: vis={vis} aria='{aria}' text='{txt}' class='{cls[:50]}'")
        except Exception:
            pass

    # Try clicking the subscription dropdown
    dropdown = console_frame.locator('.ms-Dropdown').first
    if dropdown.count() > 0 and dropdown.is_visible():
        print('\nClicking subscription dropdown...')
        dropdown.click()
        page.wait_for_timeout(2000)
        # Dump dropdown options
        options = console_frame.locator('[role="option"]')
        cnt = options.count()
        print(f'  {cnt} options found')
        for i in range(cnt):
            opt = options.nth(i)
            txt = opt.inner_text(timeout=300).strip()[:60]
            print(f'  option[{i}]: {txt}')
        # Click first option
        if cnt > 0:
            options.first.click()
            page.wait_for_timeout(2000)
            print('  Selected first subscription.')

    # Check Apply button state now
    apply_btn = console_frame.locator('button:has-text("Apply")').first
    cls = apply_btn.get_attribute('class') or ''
    print(f'\nApply class after selection: {cls}')

    # Click Apply
    if 'is-disabled' not in cls:
        apply_btn.click()
        page.wait_for_timeout(20000)
        print('Clicked Apply.')
    else:
        print('Apply still disabled!')
        apply_btn.evaluate('el => el.click()')
        page.wait_for_timeout(20000)
        print('Force clicked Apply.')

    # Check for terminal elements
    print(f'\nFrames: {len(page.frames)}')
    for i, frame in enumerate(page.frames):
        print(f'  frame[{i}]: {frame.url[:80]}')

    print('\n=== Terminal elements after Apply ===')
    for fi, frame in enumerate([page] + page.frames):
        try:
            fl = 'main' if fi == 0 else f'frame[{fi}]'
            for sel in ['.xterm-helper-textarea', 'textarea', '.xterm-rows', 'canvas', '.xterm-screen', '[class*="xterm"]', '[class*="terminal"]']:
                try:
                    loc = frame.locator(sel)
                    cnt = loc.count()
                    if cnt > 0:
                        vis = loc.first.is_visible()
                        print(f'  [{fl}] {sel}: count={cnt} visible={vis}')
                except Exception:
                    pass
        except Exception:
            continue

    ctx.close()
