"""
Mass refactor: move browser startup from verb → test function.
Works on full file content using multi-line regex.
"""
import os, re, sys, traceback

VERBS_DIR = os.path.dirname(os.path.abspath(__file__))

SKIP_FILES = {
    "cdp_utils.py", "open_browser.py", "refactor_verbs.py", "refactor_all.py",
    "do_refactor.py", "fix_js_genpython.py", "convert_clicks.py",
    "convert_to_cdp.py", "refactor2.py",
}

ALREADY_DONE = {
    "airbnb_com", "amazon_com", "bankofamerica_com", "bbc_com", "bestbuy_com",
    "booking_com", "chase_com", "coursera_org", "ctrip", "cvs_com",
    "fidelity_com", "github_com", "housing_illinois_edu",
    "maps_google_com__createList", "maps_google_com__nearby",
    "teams_microsoft_com", "ticketmaster_com", "trulia_com", "zillow_com",
}


def get_files():
    results = []
    for dirpath, _, filenames in os.walk(VERBS_DIR):
        dirname = os.path.basename(dirpath)
        if dirname.startswith("__") or dirname in ("verbs", "verb_list_generation"):
            continue
        if dirname in ALREADY_DONE:
            continue
        for fn in filenames:
            if fn in SKIP_FILES or fn.startswith("_debug") or not fn.endswith(".py"):
                continue
            fp = os.path.join(dirpath, fn)
            c = open(fp, "r", encoding="utf-8").read()
            if re.search(r'def\s+\w+\s*\([^)]*playwright', c):
                results.append(fp)
    return sorted(results)


def detect_pattern(content):
    if "launch_persistent_context" in content:
        return "persistent"
    if "connect_over_cdp" in content:
        return "cdp"
    return "unknown"


def clean_empty_finally(content):
    """Remove finally: blocks that have no indented body."""
    lines = content.split('\n')
    result = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped == 'finally:':
            indent = len(lines[i]) - len(lines[i].lstrip())
            # Check if next non-blank line is at the same or less indent
            j = i + 1
            has_body = False
            while j < len(lines):
                if lines[j].strip() == '':
                    j += 1
                    continue
                next_indent = len(lines[j]) - len(lines[j].lstrip())
                if next_indent > indent:
                    has_body = True
                break
            if not has_body:
                i += 1  # skip the finally: line
                continue
        result.append(lines[i])
        i += 1
    return '\n'.join(result)


def find_verb_func_name(content):
    """Find the main verb function name (takes playwright, not test_)."""
    m = re.search(
        r'^def\s+((?!test_)\w+)\s*\(\s*\n?\s*playwright',
        content, re.MULTILINE
    )
    if m:
        return m.group(1)
    return None


# ═══════════════════════════════════════════════════════════════
# STEP 1: Change verb function signature  playwright → page: Page
# ═══════════════════════════════════════════════════════════════

def fix_signature(content, func_name):
    # Multi-line def: def func(\n    playwright, ...) or def func(\n    playwright: Playwright, ...)
    content = re.sub(
        rf'(def\s+{re.escape(func_name)}\s*\(\s*\n?\s*)playwright\s*(?::\s*Playwright)?\s*,',
        r'\1page: Page,',
        content, count=1
    )
    # Single-line case
    content = re.sub(
        rf'(def\s+{re.escape(func_name)}\s*\(\s*)playwright\s*(?::\s*Playwright)?\s*,',
        r'\1page: Page,',
        content, count=1
    )
    return content


# ═══════════════════════════════════════════════════════════════
# STEP 2: Remove browser setup blocks from verb body
# ═══════════════════════════════════════════════════════════════

def remove_persistent_setup(content):
    """Remove persistent-context browser setup from verb function body."""

    # (a) user_data_dir block  — various indents
    content = re.sub(
        r'^\s+user_data_dir\s*=\s*os\.path\.join\([^)]*\)\s*\n',
        '', content, flags=re.MULTILINE
    )
    # multi-line form
    content = re.sub(
        r'^\s+user_data_dir\s*=\s*os\.path\.join\(\s*\n(?:\s+.*\n)*?\s+\)\s*\n',
        '', content, flags=re.MULTILINE
    )

    # (b) context = playwright.chromium.launch_persistent_context(...) block
    content = re.sub(
        r'^\s+context\s*=\s*playwright\.chromium\.launch_persistent_context\([^)]*\)\s*\n',
        '', content, flags=re.MULTILINE
    )
    content = re.sub(
        r'^\s+context\s*=\s*playwright\.chromium\.launch_persistent_context\(\s*\n(?:\s+.*\n)*?\s+\)\s*\n',
        '', content, flags=re.MULTILINE
    )

    # (c) page = context.pages[0] if context.pages else context.new_page()
    content = re.sub(
        r'^\s+page\s*=\s*context\.pages\[0\]\s*if\s+context\.pages\s+else\s+context\.new_page\(\)\s*\n',
        '', content, flags=re.MULTILINE
    )

    # (d) _watchdog function + timer setup
    # Remove def _watchdog(): ... os._exit(1)
    content = re.sub(
        r'^\s+def\s+_watchdog\(\):\s*\n(?:\s+.*\n)*?\s+os\._exit\(\d+\)\s*\n',
        '', content, flags=re.MULTILINE
    )
    # timer lines
    content = re.sub(r'^\s+timer\s*=\s*threading\.Timer\([^)]*\)\s*\n', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s+timer\.daemon\s*=\s*True\s*\n', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s+timer\.start\(\)\s*\n', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s+timer\.cancel\(\)\s*\n', '', content, flags=re.MULTILINE)

    # (e) context.close() in finally
    content = re.sub(r'^\s+context\.close\(\)\s*\n', '', content, flags=re.MULTILINE)

    # (f) Clean up empty finally blocks
    content = clean_empty_finally(content)

    return content


def remove_cdp_setup(content):
    """Remove CDP browser setup from verb function body."""

    # (a) port = get_free_port()
    content = re.sub(r'^\s+port\s*=\s*get_free_port\(\)\s*\n', '', content, flags=re.MULTILINE)

    # (b) profile_dir = tempfile.mkdtemp(...)
    content = re.sub(r'^\s+profile_dir\s*=\s*tempfile\.mkdtemp\([^)]*\)\s*\n', '', content, flags=re.MULTILINE)

    # (c) chrome = os.environ.get("CHROME_PATH") or find_chrome_executable()
    content = re.sub(r'^\s+chrome\s*=\s*os\.environ\.get\(\s*"CHROME_PATH"\s*\)\s+or\s+find_chrome_executable\(\)\s*\n', '', content, flags=re.MULTILINE)

    # (d) chrome_proc = subprocess.Popen([...]) — multi-line
    content = re.sub(
        r'^\s+chrome_proc\s*=\s*subprocess\.Popen\(\s*\n(?:\s+.*\n)*?\s+\)\s*\n',
        '', content, flags=re.MULTILINE
    )
    # single-line form
    content = re.sub(
        r'^\s+chrome_proc\s*=\s*subprocess\.Popen\([^)]*\)\s*\n',
        '', content, flags=re.MULTILINE
    )

    # (e) CDP wait loop: ws_url = None ... if not ws_url: raise TimeoutError
    content = re.sub(
        r'^\s+# Wait for CDP\s*\n',
        '', content, flags=re.MULTILINE
    )
    content = re.sub(
        r'^\s+ws_url\s*=\s*None\s*\n'
        r'\s+deadline\s*=\s*time\.time\(\)\s*\+\s*\d+\s*\n'
        r'(?:\s+.*\n)*?'
        r'\s+if\s+not\s+ws_url:\s*\n'
        r'\s+raise\s+TimeoutError\([^)]*\)\s*\n',
        '', content, flags=re.MULTILINE
    )

    # (f) browser = playwright.chromium.connect_over_cdp(...)
    content = re.sub(
        r'^\s+browser\s*=\s*playwright\.chromium\.connect_over_cdp\([^)]*\)\s*\n',
        '', content, flags=re.MULTILINE
    )

    # (g) context = browser.contexts[0]
    content = re.sub(
        r'^\s+context\s*=\s*browser\.contexts\[0\]\s*\n',
        '', content, flags=re.MULTILINE
    )

    # (h) page = context.pages[0] ...
    content = re.sub(
        r'^\s+page\s*=\s*context\.pages\[0\]\s*if\s+context\.pages\s+else\s+context\.new_page\(\)\s*\n',
        '', content, flags=re.MULTILINE
    )

    # (i) chrome_proc.terminate() / kill()
    content = re.sub(r'^\s+chrome_proc\.terminate\(\)\s*\n', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s+chrome_proc\.kill\(\)\s*\n', '', content, flags=re.MULTILINE)

    # (j) shutil.rmtree(profile_dir, ...)
    content = re.sub(r'^\s+shutil\.rmtree\(profile_dir[^)]*\)\s*\n', '', content, flags=re.MULTILINE)

    # (k) Clean up empty finally blocks
    content = clean_empty_finally(content)

    return content


# ═══════════════════════════════════════════════════════════════
# STEP 3: Fix indentation — if removing the try: that wrapped everything,
# we need to dedent the body by 4 spaces.
# ═══════════════════════════════════════════════════════════════

def fix_empty_try(content, func_name):
    """If a try: block became effectively empty/orphaned, fix it.
    Specifically: if inside the verb function there's a bare `try:` 
    with no matching except/finally, remove it and dedent."""
    
    # Find the verb function
    m = re.search(rf'^(def\s+{re.escape(func_name)}\s*\()', content, re.MULTILINE)
    if not m:
        return content
    
    func_start = m.start()
    
    # Find end of function (next def at column 0 or EOF)
    next_def = re.search(r'^(?=def\s)', content[func_start + 1:], re.MULTILINE)
    func_end = func_start + 1 + next_def.start() if next_def else len(content)
    
    func_body = content[func_start:func_end]
    
    # Check for orphaned try: with no except/finally at the same level
    # Look for `    try:\n` that doesn't have a corresponding except/finally
    lines = func_body.split('\n')
    
    try_indices = []
    for i, line in enumerate(lines):
        if re.match(r'^    try:\s*$', line):
            # Check if there's a matching except/finally at indent level 4
            has_handler = False
            for j in range(i + 1, len(lines)):
                if re.match(r'^    (except|finally)', lines[j]):
                    has_handler = True
                    break
                if re.match(r'^    \S', lines[j]) and not lines[j].strip().startswith('#'):
                    # Another statement at same level = no handler
                    break
                if lines[j].strip() == '' and j + 1 < len(lines) and re.match(r'^def\s', lines[j+1]):
                    break
            if not has_handler:
                try_indices.append(i)
    
    if not try_indices:
        return content
    
    # Dedent the body of the orphaned try
    for try_idx in reversed(try_indices):
        # Remove the try: line and dedent everything after it until end of function
        new_lines = lines[:try_idx]  # before try:
        for j in range(try_idx + 1, len(lines)):
            line = lines[j]
            if line.startswith('        '):
                new_lines.append(line[4:])  # dedent by 4
            else:
                new_lines.append(line)
        lines = new_lines
    
    new_func_body = '\n'.join(lines)
    content = content[:func_start] + new_func_body + content[func_end:]
    
    return content


# ═══════════════════════════════════════════════════════════════
# STEP 4: Modify test function to include browser setup
# ═══════════════════════════════════════════════════════════════

PERSISTENT_TEST_SETUP = '''    user_data_dir = os.path.join(
        os.environ["USERPROFILE"],
        "AppData", "Local", "Google", "Chrome", "User Data", "Default"
    )
    with sync_playwright() as {pw}:
        context = {pw}.chromium.launch_persistent_context(
            user_data_dir,
            channel="chrome",
            headless=False,
            viewport=None,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--disable-extensions",
            ],
        )
        page = context.pages[0] if context.pages else context.new_page()
        try:
{body}
        finally:
            context.close()'''

CDP_TEST_SETUP = '''    port = get_free_port()
    profile_dir = tempfile.mkdtemp(prefix="chrome_cdp_")
    chrome = os.environ.get("CHROME_PATH") or find_chrome_executable()
    chrome_proc = subprocess.Popen(
        [
            chrome,
            f"--remote-debugging-port={{port}}",
            f"--user-data-dir={{profile_dir}}",
            "--remote-allow-origins=*",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-blink-features=AutomationControlled",
            "--window-size=1280,987",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    ws_url = None
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            resp = urlopen(f"http://127.0.0.1:{{port}}/json/version", timeout=2)
            ws_url = json.loads(resp.read()).get("webSocketDebuggerUrl", "")
            if ws_url:
                break
        except Exception:
            pass
        time.sleep(0.4)
    if not ws_url:
        raise TimeoutError("Chrome CDP not ready")
    with sync_playwright() as {pw}:
        browser = {pw}.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
{body}
        finally:
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)'''


def fix_test_function(content, func_name, pattern):
    """Modify the test function to include browser setup."""
    
    # Find the `with sync_playwright() as XX:` block in the test function
    # This is after the test_ function def
    test_m = re.search(r'^(def\s+test_\w+\s*\([^)]*\)[^:]*:)', content, re.MULTILINE)
    if not test_m:
        print("      WARNING: No test function found")
        return content
    
    test_start = test_m.start()
    
    # Find the with sync_playwright block within the test function
    with_m = re.search(
        r'^(\s+)with\s+sync_playwright\(\)\s+as\s+(\w+):\s*\n',
        content[test_start:], re.MULTILINE
    )
    if not with_m:
        print("      WARNING: No 'with sync_playwright() as' in test function")
        return content
    
    with_abs_start = test_start + with_m.start()
    pw_var = with_m.group(2)
    with_indent = with_m.group(1).replace('\n', '').replace('\r', '')
    body_indent_len = len(with_indent) + 4
    
    # Collect the body of the with block
    with_body_start = test_start + with_m.end()
    
    # Find end of with block: lines at body_indent_len or deeper, or blank lines
    pos = with_body_start
    while pos < len(content):
        line_end = content.find('\n', pos)
        if line_end == -1:
            line_end = len(content)
        line = content[pos:line_end]
        
        if line.strip() == '':
            pos = line_end + 1
            continue
        
        line_indent = len(line) - len(line.lstrip())
        if line_indent < body_indent_len:
            # Check if this is something like `if __name__` or another def
            break
        pos = line_end + 1
    
    with_body_end = pos
    with_body = content[with_body_start:with_body_end]
    
    # Replace verb call: func_name(pw_var, ...) → func_name(page, ...)
    with_body = re.sub(
        rf'{re.escape(func_name)}\(\s*{re.escape(pw_var)}\s*,',
        f'{func_name}(page,',
        with_body
    )
    with_body = re.sub(
        rf'{re.escape(func_name)}\(\s*{re.escape(pw_var)}\s*\)',
        f'{func_name}(page)',
        with_body
    )
    
    # Indent the body by 4 more spaces (for try block)
    indented_body_lines = []
    for line in with_body.rstrip('\n').split('\n'):
        if line.strip():
            indented_body_lines.append('    ' + line)
        else:
            indented_body_lines.append(line)
    indented_body = '\n'.join(indented_body_lines)
    
    # Build replacement
    if pattern == "persistent":
        replacement = PERSISTENT_TEST_SETUP.format(pw=pw_var, body=indented_body)
    else:
        replacement = CDP_TEST_SETUP.format(pw=pw_var, body=indented_body)
    
    # Replace: from `with sync_playwright()` through end of its body
    content = content[:with_abs_start] + replacement + '\n' + content[with_body_end:]
    
    return content


# ═══════════════════════════════════════════════════════════════
# STEP 5: Fix imports
# ═══════════════════════════════════════════════════════════════

def fix_imports(content, pattern):
    # Add Page to playwright import
    if 'Page' not in content.split('\n')[0:30].__repr__():
        content = re.sub(
            r'(from\s+playwright\.sync_api\s+import\s+)((?!.*\bPage\b).*)',
            r'\1Page, \2',
            content, count=1
        )
    
    # Remove Playwright type if present
    content = re.sub(r',\s*Playwright\b', '', content)
    content = re.sub(r'\bPlaywright\s*,\s*', '', content)
    
    # Remove threading if no longer used in the content (persistent)
    if pattern == "persistent":
        if 'threading.' not in content and 'threading,' not in content:
            content = re.sub(r',\s*threading\b', '', content)
            content = re.sub(r'\bthreading\s*,\s*', '', content)
            content = re.sub(r'^import\s+threading\s*\n', '', content, flags=re.MULTILINE)
    
    return content


# ═══════════════════════════════════════════════════════════════
# STEP 6: Update signature.txt
# ═══════════════════════════════════════════════════════════════

def update_signature(sig_path):
    if not os.path.exists(sig_path):
        return False
    c = open(sig_path, "r", encoding="utf-8").read()
    if "playwright" not in c.lower():
        return False
    new_c = re.sub(
        r'(\(\s*\n?\s*)playwright\s*(?::\s*Playwright)?\s*,',
        r'\1page: Page,',
        c
    )
    new_c = re.sub(
        r'(\(\s*\n?\s*)playwright\s*(?::\s*Playwright)?\s*\)',
        r'\1page: Page)',
        new_c
    )
    if new_c != c:
        open(sig_path, "w", encoding="utf-8").write(new_c)
        return True
    return False


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def process_file(filepath):
    dirname = os.path.basename(os.path.dirname(filepath))
    fname = os.path.basename(filepath)
    label = f"{dirname}/{fname}"

    content = open(filepath, "r", encoding="utf-8").read()
    original = content  # backup

    pattern = detect_pattern(content)
    func_name = find_verb_func_name(content)
    if not func_name:
        print(f"  SKIP {label}: no verb function with playwright param")
        return False

    print(f"  {label} [{pattern}] func={func_name}")

    # Step 1: Fix signature
    content = fix_signature(content, func_name)

    # Step 2: Remove browser setup from verb body
    if pattern == "persistent":
        content = remove_persistent_setup(content)
    elif pattern == "cdp":
        content = remove_cdp_setup(content)
    else:
        print(f"    ERROR: unknown pattern")
        return False

    # Step 3: Fix orphaned try blocks (if the outer try: lost its finally:)
    content = fix_empty_try(content, func_name)

    # Step 4: Fix test function
    content = fix_test_function(content, func_name, pattern)

    # Step 5: Fix imports
    content = fix_imports(content, pattern)

    # Step 6: Clean up excessive blank lines
    content = re.sub(r'\n{4,}', '\n\n\n', content)

    # Write
    open(filepath, "w", encoding="utf-8").write(content)
    print(f"    OK written")

    # Step 7: Update signature.txt
    sig_path = os.path.join(os.path.dirname(filepath), "signature.txt")
    if update_signature(sig_path):
        print(f"    Updated signature.txt")

    return True


def main():
    if len(sys.argv) > 1:
        # Process specific file(s)
        for fp in sys.argv[1:]:
            if not os.path.isabs(fp):
                fp = os.path.join(VERBS_DIR, fp)
            try:
                process_file(fp)
            except Exception as e:
                print(f"  ERROR: {e}")
                traceback.print_exc()
        return

    files = get_files()
    print(f"Found {len(files)} files to refactor\n")

    ok, fail = 0, 0
    for f in files:
        try:
            if process_file(f):
                ok += 1
            else:
                fail += 1
        except Exception as e:
            print(f"  ERROR on {f}: {e}")
            traceback.print_exc()
            fail += 1

    print(f"\nDone: {ok} ok, {fail} failed/skipped")


if __name__ == "__main__":
    main()
