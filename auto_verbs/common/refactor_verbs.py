"""
Refactoring script: Move browser startup from verb function to test function.
- Verb function: takes `page: Page` instead of `playwright: Playwright`
- Test function: creates browser context/page, passes page to verb
- Updates signature.txt accordingly
"""
import os
import re
import glob

VERBS_DIR = r"d:\repos\stagehand\auto_verbs\verbs"

# Skip already-done files and non-verb files
SKIP_FILES = {
    "cdp_utils.py", "open_browser.py", "convert_clicks.py",
    "convert_to_cdp.py", "do_refactor.py", "fix_js_genpython.py",
}
# These already take page param - skip
ALREADY_DONE_DIRS = {"alaskaair_com", "amtrak_com", "ebay_com", "etsy_com", "expedia_com", "airbnb_com"}


def get_verb_files():
    """Get all verb .py files that need refactoring."""
    results = []
    for folder in sorted(os.listdir(VERBS_DIR)):
        folder_path = os.path.join(VERBS_DIR, folder)
        if not os.path.isdir(folder_path) or folder == "__pycache__":
            continue
        if folder in ALREADY_DONE_DIRS:
            continue
        for f in os.listdir(folder_path):
            if f.endswith(".py") and f not in SKIP_FILES and not f.startswith("_"):
                results.append(os.path.join(folder_path, f))
    return results


def detect_pattern(content):
    """Detect if file uses persistent context or CDP."""
    if "launch_persistent_context" in content:
        return "persistent"
    elif "connect_over_cdp" in content:
        return "cdp"
    return "other"


def find_verb_function(content):
    """Find the main verb function definition line and its name."""
    # Look for def xxx(playwright or def xxx(page
    m = re.search(r'^(def\s+(\w+)\s*\(\s*(?:playwright\s*(?::\s*\w+)?|page\s*(?::\s*\w+)?)\s*,\s*request)', content, re.MULTILINE)
    if m:
        return m.group(2), m.start()
    # Also try: def xxx(playwright) without request
    m = re.search(r'^(def\s+(\w+)\s*\(\s*playwright\s*(?::\s*\w+)?)', content, re.MULTILINE)
    if m:
        return m.group(2), m.start()
    return None, None


def refactor_persistent(filepath, content):
    """Refactor a persistent-context verb file."""
    func_name, func_pos = find_verb_function(content)
    if not func_name:
        return None, "Could not find verb function"

    # Replace playwright param with page: Page in function signature
    # Pattern: def func_name(playwright: Playwright, request: ...) or def func_name(playwright, request: ...)
    new_content = re.sub(
        r'(def\s+' + re.escape(func_name) + r'\s*\(\s*)playwright\s*(?::\s*Playwright)?\s*,',
        r'\1page: Page,',
        content
    )
    # Also handle case without request param
    new_content = re.sub(
        r'(def\s+' + re.escape(func_name) + r'\s*\(\s*)playwright\s*(?::\s*Playwright)?\s*\)',
        r'\1page: Page)',
        new_content
    )

    # Remove browser setup block inside the verb function
    # Pattern: user_data_dir = ... context = playwright.chromium.launch_persistent_context(...) page = context.pages[0] ...
    # This is tricky - let's find the indented block
    
    # Remove user_data_dir assignment
    new_content = re.sub(
        r'\n    user_data_dir\s*=\s*os\.path\.join\([^)]+\)\n',
        '\n',
        new_content
    )
    
    # Remove context = playwright.chromium.launch_persistent_context(...) block
    new_content = re.sub(
        r'\n    context\s*=\s*playwright\.chromium\.launch_persistent_context\([^)]+\)\n',
        '\n',
        new_content
    )
    
    # Remove page = context.pages[0] ... line
    new_content = re.sub(
        r'\n    page\s*=\s*context\.pages\[0\]\s*if\s+context\.pages\s+else\s+context\.new_page\(\)\n',
        '\n',
        new_content
    )
    
    # Remove context.close() in finally blocks
    new_content = re.sub(
        r'\n\s+try:\s*\n\s+context\.close\(\)\s*\n\s+except\s+Exception:\s*\n\s+pass\n',
        '\n',
        new_content
    )
    # Also simpler context.close()
    new_content = re.sub(
        r'\n\s+context\.close\(\)\s*\n',
        '\n',
        new_content
    )

    # Remove watchdog/timer blocks if present
    new_content = re.sub(
        r'\n    def _watchdog\(\):.*?timer\.start\(\)\n',
        '\n',
        new_content,
        flags=re.DOTALL
    )
    new_content = re.sub(r'\n\s+timer\.cancel\(\)\n', '\n', new_content)

    # Update import: replace Playwright with Page, or add Page
    if 'from playwright.sync_api import' in new_content:
        # Remove Playwright, add Page
        new_content = re.sub(r'\bPlaywright\b,?\s*', '', new_content)
        if 'Page' not in new_content:
            new_content = re.sub(
                r'(from playwright\.sync_api import\s+)',
                r'\1Page, ',
                new_content
            )
        # Clean up double commas or trailing commas
        new_content = re.sub(r'import\s+,\s*', 'import ', new_content)
        new_content = re.sub(r',\s*$', '', new_content, flags=re.MULTILINE)
    elif 'import Playwright' not in new_content and 'from playwright' not in new_content:
        # Add import
        new_content = re.sub(
            r'(from playwright\.sync_api import sync_playwright)',
            r'\1, Page',
            new_content
        )

    # Ensure Page is imported
    if 'Page' not in new_content and 'from playwright' in new_content:
        new_content = re.sub(
            r'(from playwright\.sync_api import\s+)(.*)',
            lambda m: m.group(1) + 'Page, ' + m.group(2) if 'Page' not in m.group(2) else m.group(0),
            new_content,
            count=1
        )

    # Now fix the test function - add browser setup there
    # Find test function
    test_match = re.search(r'^(def\s+(test_\w+)\s*\(.*?\):)', new_content, re.MULTILINE)
    if not test_match:
        return None, "Could not find test function"
    
    test_func_name = test_match.group(2)
    
    # Find the "with sync_playwright() as" block in the test function
    # and wrap the verb call with browser setup
    # Pattern: with sync_playwright() as pw/playwright: result = verb_func(pw/playwright, request)
    
    # Replace the sync_playwright block
    old_pattern = re.compile(
        r'(\s+with\s+sync_playwright\(\)\s+as\s+(\w+):\s*\n)'
        r'(\s+)(result\s*=\s*' + re.escape(func_name) + r'\s*\(\s*\2\s*,\s*(\w+)\s*\))',
        re.MULTILINE
    )
    
    match = old_pattern.search(new_content)
    if match:
        indent = match.group(3)
        req_var = match.group(5)
        pw_var = match.group(2)
        replacement = (
            f"    user_data_dir = os.path.join(\n"
            f"        os.environ[\"USERPROFILE\"],\n"
            f"        \"AppData\", \"Local\", \"Google\", \"Chrome\", \"User Data\", \"Default\"\n"
            f"    )\n"
            f"    with sync_playwright() as {pw_var}:\n"
            f"{indent}context = {pw_var}.chromium.launch_persistent_context(\n"
            f"{indent}    user_data_dir,\n"
            f"{indent}    channel=\"chrome\",\n"
            f"{indent}    headless=False,\n"
            f"{indent}    viewport=None,\n"
            f"{indent}    args=[\n"
            f"{indent}        \"--disable-blink-features=AutomationControlled\",\n"
            f"{indent}        \"--disable-infobars\",\n"
            f"{indent}        \"--disable-extensions\",\n"
            f"{indent}    ],\n"
            f"{indent})\n"
            f"{indent}page = context.pages[0] if context.pages else context.new_page()\n"
            f"{indent}try:\n"
            f"{indent}    result = {func_name}(page, {req_var})"
        )
        new_content = new_content[:match.start()] + "\n" + replacement + new_content[match.end():]
        
        # Add finally: context.close() before the end of test function
        # Find the return or end of test function
        # Look for lines after the result = ... that are at the same indent level
        # Add finally block
    
    return new_content, None


def refactor_cdp(filepath, content):
    """Refactor a CDP verb file - move CDP setup to test, verb takes page."""
    func_name, func_pos = find_verb_function(content)
    if not func_name:
        return None, "Could not find verb function"

    # This is more complex due to CDP setup being intertwined with the verb logic
    # For now, let's do a simpler approach: just change the signature
    # and extract the CDP block

    # Replace playwright param with page: Page
    new_content = re.sub(
        r'(def\s+' + re.escape(func_name) + r'\s*\(\s*)playwright\s*(?::\s*Playwright)?\s*,',
        r'\1page: Page,',
        content
    )
    new_content = re.sub(
        r'(def\s+' + re.escape(func_name) + r'\s*\(\s*)playwright\s*(?::\s*Playwright)?\s*\)',
        r'\1page: Page)',
        new_content
    )

    return new_content, "CDP_NEEDS_MANUAL"


def update_signature(sig_path, old_content):
    """Update signature.txt to use page: Page instead of playwright: Playwright."""
    new_content = re.sub(
        r'(def\s+\w+\s*\(\s*)playwright\s*(?::\s*Playwright)?\s*,\s*',
        r'\1page: Page, ',
        old_content
    )
    new_content = re.sub(
        r'(def\s+\w+\s*\(\s*)playwright\s*(?::\s*Playwright)?\s*\)',
        r'\1page: Page)',
        new_content
    )
    return new_content


def main():
    files = get_verb_files()
    print(f"Found {len(files)} files to process\n")
    
    persistent_files = []
    cdp_files = []
    other_files = []
    
    for f in files:
        content = open(f, "r", encoding="utf-8").read()
        pattern = detect_pattern(content)
        if pattern == "persistent":
            persistent_files.append(f)
        elif pattern == "cdp":
            cdp_files.append(f)
        else:
            other_files.append(f)
    
    print(f"Persistent: {len(persistent_files)}")
    print(f"CDP: {len(cdp_files)}")
    print(f"Other: {len(other_files)}")
    
    # Process signature.txt files for ALL
    sig_count = 0
    for f in files:
        sig_path = os.path.join(os.path.dirname(f), "signature.txt")
        if os.path.exists(sig_path):
            sig_content = open(sig_path, "r", encoding="utf-8").read()
            if "playwright" in sig_content.lower():
                new_sig = update_signature(sig_path, sig_content)
                if new_sig != sig_content:
                    open(sig_path, "w", encoding="utf-8").write(new_sig)
                    sig_count += 1
                    print(f"  Updated signature: {os.path.basename(os.path.dirname(f))}/signature.txt")
    
    print(f"\nUpdated {sig_count} signature.txt files")
    print(f"\nFiles needing manual review for CDP pattern:")
    for f in cdp_files:
        print(f"  {os.path.basename(os.path.dirname(f))}/{os.path.basename(f)}")


if __name__ == "__main__":
    main()
