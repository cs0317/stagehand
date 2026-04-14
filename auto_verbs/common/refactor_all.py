"""
Mass refactoring script: moves browser startup from verb function to test function.
- Persistent pattern: launch_persistent_context -> verb takes page: Page
- CDP pattern: connect_over_cdp -> verb takes page: Page

Strategy: multi-line regex on full file content. Process verb function to remove
browser setup, then modify test function to add it.
"""
import os, re, sys, copy

VERBS_DIR = os.path.dirname(os.path.abspath(__file__))

SKIP_FILES = {
    "cdp_utils.py", "open_browser.py", "refactor_verbs.py", "refactor_all.py",
    "do_refactor.py", "fix_js_genpython.py", "convert_clicks.py",
    "convert_to_cdp.py",
}

ALREADY_DONE = {
    "airbnb_com", "amazon_com", "bankofamerica_com", "bbc_com", "bestbuy_com",
    "booking_com", "chase_com", "coursera_org", "ctrip", "cvs_com",
    "fidelity_com", "github_com", "housing_illinois_edu",
    "maps_google_com__createList", "maps_google_com__nearby",
    "teams_microsoft_com", "ticketmaster_com", "trulia_com", "zillow_com",
}


def get_verb_files():
    """Get all verb .py files that need refactoring."""
    results = []
    for dirpath, _, filenames in os.walk(VERBS_DIR):
        dirname = os.path.basename(dirpath)
        if dirname.startswith("__") or dirname == "verbs":
            continue
        if dirname in ALREADY_DONE:
            continue
        for fn in filenames:
            if fn in SKIP_FILES or fn.startswith("_debug") or not fn.endswith(".py"):
                continue
            filepath = os.path.join(dirpath, fn)
            content = open(filepath, "r", encoding="utf-8").read()
            # Check if it has a function with playwright param
            if re.search(r'def\s+\w+\s*\([^)]*playwright', content):
                results.append(filepath)
    return sorted(results)


def detect_pattern(content):
    if "launch_persistent_context" in content:
        return "persistent"
    if "connect_over_cdp" in content:
        return "cdp"
    return "unknown"


def find_verb_function(content):
    """Find the main verb function (takes playwright, not test_)."""
    m = re.search(
        r'^(def\s+((?!test_)\w+)\s*\(\s*(?:\n\s+)?playwright\b[^)]*\))',
        content, re.MULTILINE
    )
    if m:
        return m.group(2), m.start()
    return None, None


def find_verb_func_end(lines, start_line):
    """Find the end line of the verb function (next def at same indent or EOF)."""
    # Find indent of the def line
    indent = len(lines[start_line]) - len(lines[start_line].lstrip())
    for i in range(start_line + 1, len(lines)):
        stripped = lines[i].strip()
        if stripped == "" or stripped.startswith("#"):
            continue
        line_indent = len(lines[i]) - len(lines[i].lstrip())
        # A line at same or less indent that starts a def/class = end of function
        if line_indent <= indent and (stripped.startswith("def ") or stripped.startswith("class ")):
            return i
    return len(lines)


def find_test_function(lines):
    """Find the test function line number."""
    for i, line in enumerate(lines):
        if re.match(r'^def\s+test_', line):
            return i
    return None


# ── Persistent pattern refactoring ──

PERSISTENT_BROWSER_SETUP = """\
    user_data_dir = os.path.join(
        os.environ["USERPROFILE"],
        "AppData", "Local", "Google", "Chrome", "User Data", "Default"
    )
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
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
"""

PERSISTENT_FINALLY = """\
        finally:
            context.close()
"""

# ── CDP pattern browser setup for test function ──

CDP_BROWSER_SETUP = """\
    port = get_free_port()
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
    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
"""

CDP_FINALLY = """\
        finally:
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)
"""


def should_remove_persistent_line(line):
    """Check if a line belongs to persistent browser setup in verb function."""
    stripped = line.strip()
    patterns = [
        r'^user_data_dir\s*=',
        r'^os\.environ\[',
        r'^"AppData"',
        r'^"Local"',
        r'^context\s*=\s*playwright\.chromium\.launch_persistent_context',
        r'^user_data_dir,',
        r'^channel\s*=\s*"chrome"',
        r'^headless\s*=',
        r'^viewport\s*=\s*None',
        r'^args\s*=\s*\[',
        r'^"--disable-blink-features',
        r'^"--disable-infobars"',
        r'^"--disable-extensions"',
        r'^\],?\s*$',  # closing bracket of args
        r'^\)\s*$',    # closing paren of launch_persistent_context
        r'^page\s*=\s*context\.pages\[0\]',
        r'^def\s+_watchdog\(',
        r'^print\(\s*".*WATCHDOG',
        r'^try:\s*$',
        r'^context\.close\(\)',
        r'^except\s+Exception',
        r'^pass\s*$',
        r'^os\._exit\(\d+\)',
        r'^timer\s*=\s*threading\.Timer',
        r'^timer\.daemon\s*=',
        r'^timer\.start\(\)',
        r'^timer\.cancel\(\)',
    ]
    for p in patterns:
        if re.match(p, stripped):
            return True
    return False


def should_remove_cdp_line(line):
    """Check if a line belongs to CDP browser setup in verb function."""
    stripped = line.strip()
    patterns = [
        r'^port\s*=\s*get_free_port',
        r'^profile_dir\s*=\s*tempfile\.mkdtemp',
        r'^chrome\s*=\s*os\.environ\.get\(\s*"CHROME_PATH"',
        r'^chrome_proc\s*=\s*subprocess\.Popen',
        r'^\[\s*$',
        r'^chrome,\s*$',
        r'^f"--remote-debugging-port',
        r'^f"--user-data-dir',
        r'^"--remote-allow-origins',
        r'^"--no-first-run"',
        r'^"--no-default-browser-check"',
        r'^"--disable-blink-features',
        r'^"--window-size=',
        r'^"about:blank"',
        r'^\],?\s*$',
        r'^\)\s*$',
        r'^stdout\s*=\s*subprocess\.DEVNULL',
        r'^stderr\s*=\s*subprocess\.DEVNULL',
        r'^ws_url\s*=\s*None',
        r'^deadline\s*=\s*time\.time\(\)',
        r'^while\s+time\.time\(\)\s*<\s*deadline',
        r'^try:\s*$',
        r'^resp\s*=\s*urlopen\(',
        r'^ws_url\s*=\s*json\.loads',
        r'^if\s+ws_url',
        r'^break\s*$',
        r'^except\s+(Exception|OSError)',
        r'^pass\s*$',
        r'^time\.sleep\(',
        r'^if\s+not\s+ws_url',
        r'^raise\s+TimeoutError',
        r'^browser\s*=\s*playwright\.chromium\.connect_over_cdp',
        r'^context\s*=\s*browser\.contexts\[0\]',
        r'^page\s*=\s*context\.pages\[0\]',
        r'^chrome_proc\.terminate',
        r'^chrome_proc\.kill',
        r'^shutil\.rmtree\(profile_dir',
    ]
    for p in patterns:
        if re.match(p, stripped):
            return True
    return False


def refactor_verb_body_persistent(lines, func_start, func_end):
    """Remove persistent browser setup from verb function body."""
    # Lines to remove from the verb function
    new_lines = []
    i = func_start
    # Keep the def line (already modified elsewhere)
    
    in_watchdog = False
    in_setup_block = False
    watchdog_indent = None
    removed_try = False
    
    for idx in range(func_start, func_end):
        line = lines[idx]
        stripped = line.strip()
        
        # Detect start of _watchdog function
        if re.match(r'\s+def\s+_watchdog\(', line):
            in_watchdog = True
            watchdog_indent = len(line) - len(line.lstrip())
            continue
        
        # Skip watchdog body
        if in_watchdog:
            if stripped == "" or (len(line) - len(line.lstrip())) > watchdog_indent:
                continue
            elif re.match(r'\s+(try|print|context|except|pass|os\.)', line) and (len(line) - len(line.lstrip())) > watchdog_indent:
                continue
            else:
                in_watchdog = False
        
        # Check if this line should be removed
        if should_remove_persistent_line(line):
            # Special: if it's a `try:` that's part of the setup, remove it
            # but we need to dedent the contents
            if stripped == "try:" and idx > func_start + 5:
                # This is likely the main try block wrapping the verb logic
                # Check if the lines above were all setup
                # We keep this try if it wraps actual logic with except
                pass  # Don't remove try: blocks blindly
            continue
        
        # Check for finally block that only has timer.cancel() and/or context.close()
        if stripped == "finally:":
            # Look ahead to see if the finally block only has cleanup
            finally_lines = []
            for j in range(idx + 1, func_end):
                fs = lines[j].strip()
                if fs == "" or fs.startswith("#"):
                    continue
                if fs in ("timer.cancel()", "context.close()", "pass"):
                    finally_lines.append(j)
                else:
                    break
            if finally_lines:
                # Skip the finally and its cleanup lines
                for fl in finally_lines:
                    lines[fl] = "###REMOVE###"
                continue
        
        if line.strip() == "###REMOVE###":
            continue
            
        new_lines.append(line)
    
    return new_lines


def refactor_verb_body_cdp(lines, func_start, func_end):
    """Remove CDP browser setup from verb function body."""
    new_lines = []
    skip_until_page_logic = False
    in_cdp_setup = False
    brace_depth = 0
    
    # First pass: mark lines for removal
    removal_indices = set()
    i = func_start
    
    while i < func_end:
        line = lines[i]
        stripped = line.strip()
        
        if should_remove_cdp_line(line):
            removal_indices.add(i)
            i += 1
            continue
            
        # Check for finally block that only has chrome_proc.terminate and shutil.rmtree
        if stripped == "finally:":
            finally_cleanup = True
            cleanup_lines = []
            for j in range(i + 1, func_end):
                fs = lines[j].strip()
                if fs == "" or fs.startswith("#"):
                    cleanup_lines.append(j)
                    continue
                if re.match(r'^(chrome_proc\.(terminate|kill)\(\)|shutil\.rmtree\(|pass)', fs):
                    cleanup_lines.append(j)
                else:
                    finally_cleanup = False
                    break
            if finally_cleanup and cleanup_lines:
                removal_indices.add(i)
                for cl in cleanup_lines:
                    removal_indices.add(cl)
                i += 1
                continue
        
        i += 1
    
    # Second pass: collect non-removed lines
    for idx in range(func_start, func_end):
        if idx not in removal_indices:
            new_lines.append(lines[idx])
    
    return new_lines


def fix_indentation(verb_lines, func_start_line_text):
    """Fix indentation if we removed a try: block that wrapped everything."""
    # After removing setup, check if the first non-blank line after the def
    # has excess indentation from being inside a removed try block.
    # The standard verb body indent should be 4 spaces (1 level).
    # If we find 8 spaces consistently, dedent by 4.
    
    result = []
    inside_func = False
    for line in verb_lines:
        result.append(line)
    return result


def refactor_test_persistent(lines, test_start, func_end, verb_func_name):
    """Rewrite test function to include persistent browser setup."""
    new_test_lines = []
    
    for idx in range(test_start, func_end):
        line = lines[idx]
        stripped = line.strip()
        
        # Find the `with sync_playwright() as` line
        m = re.match(r'^(\s+)with\s+sync_playwright\(\)\s+as\s+(\w+):', line)
        if m:
            indent = m.group(1)
            pw_var = m.group(2)
            
            # Collect everything inside the with block
            with_body = []
            with_indent = len(indent) + 4
            for j in range(idx + 1, func_end):
                wline = lines[j]
                if wline.strip() == "" or (len(wline) - len(wline.lstrip()) >= with_indent):
                    with_body.append(lines[j])
                elif wline.strip().startswith("#"):
                    with_body.append(lines[j])
                else:
                    break
            
            # Build replacement
            new_test_lines.append(f"{indent}user_data_dir = os.path.join(\n")
            new_test_lines.append(f'{indent}    os.environ["USERPROFILE"],\n')
            new_test_lines.append(f'{indent}    "AppData", "Local", "Google", "Chrome", "User Data", "Default"\n')
            new_test_lines.append(f"{indent})\n")
            new_test_lines.append(f"{indent}with sync_playwright() as {pw_var}:\n")
            new_test_lines.append(f"{indent}    context = {pw_var}.chromium.launch_persistent_context(\n")
            new_test_lines.append(f"{indent}        user_data_dir,\n")
            new_test_lines.append(f'{indent}        channel="chrome",\n')
            new_test_lines.append(f"{indent}        headless=False,\n")
            new_test_lines.append(f"{indent}        viewport=None,\n")
            new_test_lines.append(f"{indent}        args=[\n")
            new_test_lines.append(f'{indent}            "--disable-blink-features=AutomationControlled",\n')
            new_test_lines.append(f'{indent}            "--disable-infobars",\n')
            new_test_lines.append(f'{indent}            "--disable-extensions",\n')
            new_test_lines.append(f"{indent}        ],\n")
            new_test_lines.append(f"{indent}    )\n")
            new_test_lines.append(f"{indent}    page = context.pages[0] if context.pages else context.new_page()\n")
            new_test_lines.append(f"{indent}    try:\n")
            
            # Re-indent with_body items and replace verb call
            for wline in with_body:
                # Replace verb_func(playwright, ...) with verb_func(page, ...)
                modified = re.sub(
                    rf'{verb_func_name}\(\s*{pw_var}\s*,',
                    f'{verb_func_name}(page,',
                    wline
                )
                modified = re.sub(
                    rf'{verb_func_name}\(\s*{pw_var}\s*\)',
                    f'{verb_func_name}(page)',
                    modified
                )
                # Add extra indent (4 spaces) for try block
                if modified.strip():
                    current_indent = len(modified) - len(modified.lstrip())
                    new_test_lines.append(" " * 4 + modified)
                else:
                    new_test_lines.append(modified)
            
            new_test_lines.append(f"{indent}    finally:\n")
            new_test_lines.append(f"{indent}        context.close()\n")
            
            # Skip the original with block lines
            skip_to = idx + 1 + len(with_body)
            # Continue from after the with block
            for k in range(skip_to, func_end):
                new_test_lines.append(lines[k])
            break
        else:
            new_test_lines.append(line)
    
    return new_test_lines


def refactor_test_cdp(lines, test_start, func_end, verb_func_name):
    """Rewrite test function to include CDP browser setup."""
    new_test_lines = []
    
    for idx in range(test_start, func_end):
        line = lines[idx]
        stripped = line.strip()
        
        # Find the `with sync_playwright() as` line
        m = re.match(r'^(\s+)with\s+sync_playwright\(\)\s+as\s+(\w+):', line)
        if m:
            indent = m.group(1)
            pw_var = m.group(2)
            
            # Collect everything inside the with block
            with_body = []
            with_indent_len = len(indent) + 4
            for j in range(idx + 1, func_end):
                wline = lines[j]
                if wline.strip() == "" or (len(wline) - len(wline.lstrip()) >= with_indent_len):
                    with_body.append(lines[j])
                elif wline.strip().startswith("#"):
                    with_body.append(lines[j])
                else:
                    break
            
            # Build CDP setup
            new_test_lines.append(f"{indent}port = get_free_port()\n")
            new_test_lines.append(f'{indent}profile_dir = tempfile.mkdtemp(prefix="chrome_cdp_")\n')
            new_test_lines.append(f'{indent}chrome = os.environ.get("CHROME_PATH") or find_chrome_executable()\n')
            new_test_lines.append(f"{indent}chrome_proc = subprocess.Popen(\n")
            new_test_lines.append(f"{indent}    [\n")
            new_test_lines.append(f"{indent}        chrome,\n")
            new_test_lines.append(f'{indent}        f"--remote-debugging-port={{port}}",\n')
            new_test_lines.append(f'{indent}        f"--user-data-dir={{profile_dir}}",\n')
            new_test_lines.append(f'{indent}        "--remote-allow-origins=*",\n')
            new_test_lines.append(f'{indent}        "--no-first-run",\n')
            new_test_lines.append(f'{indent}        "--no-default-browser-check",\n')
            new_test_lines.append(f'{indent}        "--disable-blink-features=AutomationControlled",\n')
            new_test_lines.append(f'{indent}        "--window-size=1280,987",\n')
            new_test_lines.append(f'{indent}        "about:blank",\n')
            new_test_lines.append(f"{indent}    ],\n")
            new_test_lines.append(f"{indent}    stdout=subprocess.DEVNULL,\n")
            new_test_lines.append(f"{indent}    stderr=subprocess.DEVNULL,\n")
            new_test_lines.append(f"{indent})\n")
            new_test_lines.append(f"{indent}ws_url = None\n")
            new_test_lines.append(f"{indent}deadline = time.time() + 15\n")
            new_test_lines.append(f"{indent}while time.time() < deadline:\n")
            new_test_lines.append(f"{indent}    try:\n")
            new_test_lines.append(f'{indent}        resp = urlopen(f"http://127.0.0.1:{{port}}/json/version", timeout=2)\n')
            new_test_lines.append(f'{indent}        ws_url = json.loads(resp.read()).get("webSocketDebuggerUrl", "")\n')
            new_test_lines.append(f"{indent}        if ws_url:\n")
            new_test_lines.append(f"{indent}            break\n")
            new_test_lines.append(f"{indent}    except Exception:\n")
            new_test_lines.append(f"{indent}        pass\n")
            new_test_lines.append(f"{indent}    time.sleep(0.4)\n")
            new_test_lines.append(f"{indent}if not ws_url:\n")
            new_test_lines.append(f'{indent}    raise TimeoutError("Chrome CDP not ready")\n')
            new_test_lines.append(f"{indent}with sync_playwright() as {pw_var}:\n")
            new_test_lines.append(f"{indent}    browser = {pw_var}.chromium.connect_over_cdp(ws_url)\n")
            new_test_lines.append(f"{indent}    context = browser.contexts[0]\n")
            new_test_lines.append(f"{indent}    page = context.pages[0] if context.pages else context.new_page()\n")
            new_test_lines.append(f"{indent}    try:\n")
            
            # Re-indent with_body items and replace verb call
            for wline in with_body:
                modified = re.sub(
                    rf'{verb_func_name}\(\s*{pw_var}\s*,',
                    f'{verb_func_name}(page,',
                    wline
                )
                modified = re.sub(
                    rf'{verb_func_name}\(\s*{pw_var}\s*\)',
                    f'{verb_func_name}(page)',
                    modified
                )
                if modified.strip():
                    new_test_lines.append(" " * 4 + modified)
                else:
                    new_test_lines.append(modified)
            
            new_test_lines.append(f"{indent}    finally:\n")
            new_test_lines.append(f"{indent}        chrome_proc.terminate()\n")
            new_test_lines.append(f"{indent}        shutil.rmtree(profile_dir, ignore_errors=True)\n")
            
            # Skip the original with block lines
            skip_to = idx + 1 + len(with_body)
            for k in range(skip_to, func_end):
                new_test_lines.append(lines[k])
            break
        else:
            new_test_lines.append(line)
    
    return new_test_lines


def update_imports(content, pattern):
    """Update import lines based on pattern."""
    # Add Page to playwright import if not present
    content = re.sub(
        r'(from\s+playwright\.sync_api\s+import\s+)(.*)',
        lambda m: m.group(0) if 'Page' in m.group(2) else m.group(1) + 'Page, ' + m.group(2),
        content,
        count=1
    )
    
    # Remove Playwright type import if present (not needed anymore in the verb)
    # But keep sync_playwright since test function uses it
    # Just remove the Playwright type: ", Playwright" or "Playwright, "
    content = re.sub(r',\s*Playwright\b', '', content)
    content = re.sub(r'\bPlaywright\s*,\s*', '', content)
    
    # Remove threading import if only used for watchdog (persistent pattern)
    if pattern == "persistent" and "threading" in content:
        # Check if threading is used elsewhere
        uses = re.findall(r'threading\.', content)
        if not uses or all('Timer' in u or 'timer' in content for u in uses):
            # Check if timer/threading is still used after refactoring
            if 'threading.' not in content.split('def test_')[0] if 'def test_' in content else True:
                content = re.sub(r'^import\s+threading\s*\n', '', content, flags=re.MULTILINE)
                content = re.sub(r',\s*threading\b', '', content)
                content = re.sub(r'\bthreading\s*,\s*', '', content)
    
    return content


def update_signature_file(sig_path):
    """Update signature.txt to use page: Page."""
    if not os.path.exists(sig_path):
        return False
    content = open(sig_path, "r", encoding="utf-8").read()
    if "playwright" not in content.lower():
        return False
    new_content = re.sub(
        r'(def\s+\w+\s*\(\s*(?:\n\s+)?)playwright\s*(?::\s*Playwright)?\s*,\s*',
        r'\1page: Page, ',
        content
    )
    new_content = re.sub(
        r'(def\s+\w+\s*\(\s*(?:\n\s+)?)playwright\s*(?::\s*Playwright)?\s*\)',
        r'\1page: Page)',
        new_content
    )
    if new_content != content:
        open(sig_path, "w", encoding="utf-8").write(new_content)
        return True
    return False


def process_file(filepath):
    """Main processing function for a single file."""
    content = open(filepath, "r", encoding="utf-8").read()
    dirname = os.path.basename(os.path.dirname(filepath))
    fname = os.path.basename(filepath)
    label = f"{dirname}/{fname}"
    
    pattern = detect_pattern(content)
    verb_func_name, verb_func_pos = find_verb_function(content)
    
    if not verb_func_name:
        print(f"  SKIP {label}: no verb function with playwright param")
        return False
    
    print(f"  Processing {label} [{pattern}] func={verb_func_name}")
    
    lines = content.splitlines(keepends=True)
    
    # Find verb function line range
    verb_start = None
    for i, line in enumerate(lines):
        if line.lstrip().startswith(f"def {verb_func_name}("):
            verb_start = i
            break
        # Also check multi-line def
        if re.match(rf'^def\s+{re.escape(verb_func_name)}\s*\(', line.lstrip()):
            verb_start = i
            break
    
    if verb_start is None:
        print(f"    ERROR: Could not find verb function start line")
        return False
    
    verb_end = find_verb_func_end(lines, verb_start)
    test_start = find_test_function(lines)
    
    if test_start is None:
        print(f"    WARNING: No test function found")
    
    # 1. Change verb function signature
    # Replace playwright param with page: Page
    sig_pattern = re.compile(
        rf'(def\s+{re.escape(verb_func_name)}\s*\(\s*(?:\n\s+)?)playwright\s*(?::\s*Playwright)?(\s*,)',
        re.MULTILINE
    )
    content = sig_pattern.sub(r'\1page: Page\2', content, count=1)
    
    # Also handle case where playwright is the only param
    sig_pattern2 = re.compile(
        rf'(def\s+{re.escape(verb_func_name)}\s*\(\s*(?:\n\s+)?)playwright\s*(?::\s*Playwright)?(\s*\))',
        re.MULTILINE
    )
    content = sig_pattern2.sub(r'\1page: Page\2', content, count=1)
    
    # Re-split after signature change
    lines = content.splitlines(keepends=True)
    
    # Re-find positions after signature change
    for i, line in enumerate(lines):
        if re.match(rf'^\s*def\s+{re.escape(verb_func_name)}\s*\(', line) or \
           re.match(rf'^def\s+{re.escape(verb_func_name)}\s*\(', line):
            verb_start = i
            break
    verb_end = find_verb_func_end(lines, verb_start)
    test_start = find_test_function(lines)
    test_end = len(lines) if test_start is not None else None
    
    # 2. Remove browser setup from verb function body
    if pattern == "persistent":
        new_verb_lines = refactor_verb_body_persistent(lines, verb_start, verb_end)
    elif pattern == "cdp":
        new_verb_lines = refactor_verb_body_cdp(lines, verb_start, verb_end)
    else:
        print(f"    ERROR: Unknown pattern")
        return False
    
    # 3. Refactor test function
    if test_start is not None:
        if pattern == "persistent":
            new_test_lines = refactor_test_persistent(lines, test_start, test_end, verb_func_name)
        else:
            new_test_lines = refactor_test_cdp(lines, test_start, test_end, verb_func_name)
    else:
        new_test_lines = lines[verb_end:]  # everything after verb func
    
    # 4. Reconstruct file
    before_verb = lines[:verb_start]
    after_verb_before_test = lines[verb_end:test_start] if test_start else lines[verb_end:]
    
    new_content = "".join(before_verb + new_verb_lines + after_verb_before_test + new_test_lines)
    
    # 5. Update imports
    new_content = update_imports(new_content, pattern)
    
    # 6. Clean up: remove consecutive blank lines (max 2)
    new_content = re.sub(r'\n{4,}', '\n\n\n', new_content)
    
    # 7. Remove threading import if no longer used
    if "threading" not in new_content.split("import")[-1] if "threading" in content else False:
        pass  # already handled in update_imports
    
    # Write
    open(filepath, "w", encoding="utf-8").write(new_content)
    
    # 8. Update signature.txt
    sig_path = os.path.join(os.path.dirname(filepath), "signature.txt")
    if update_signature_file(sig_path):
        print(f"    Updated signature.txt")
    
    print(f"    OK")
    return True


def main():
    files = get_verb_files()
    print(f"Found {len(files)} files to refactor\n")
    
    success = 0
    failed = 0
    
    for f in files:
        try:
            if process_file(f):
                success += 1
            else:
                failed += 1
        except Exception as e:
            import traceback
            print(f"  EXCEPTION processing {f}: {e}")
            traceback.print_exc()
            failed += 1
    
    print(f"\nDone: {success} succeeded, {failed} failed/skipped")


if __name__ == "__main__":
    main()
