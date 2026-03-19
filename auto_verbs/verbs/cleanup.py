"""
Cleanup pass: remove cdp_utils helper calls and browser.close() from verb bodies.
Also fix empty try:/except blocks.
"""
import os, re

VERBS_DIR = os.path.dirname(os.path.abspath(__file__))


def get_files():
    results = []
    for dirpath, _, filenames in os.walk(VERBS_DIR):
        dirname = os.path.basename(dirpath)
        if dirname.startswith("__") or dirname in ("verbs", "verb_list_generation"):
            continue
        for fn in filenames:
            if fn.startswith("_debug") or fn.startswith("refactor") or fn.endswith(".bak"):
                continue
            if fn in ("cdp_utils.py", "open_browser.py", "do_refactor.py",
                      "fix_js_genpython.py", "convert_clicks.py", "convert_to_cdp.py",
                      "cleanup.py"):
                continue
            if not fn.endswith(".py"):
                continue
            results.append(os.path.join(dirpath, fn))
    return sorted(results)


def find_verb_end(content):
    """Find where the verb function body ends (before test_ or if __name__)."""
    m = re.search(r'^def\s+test_', content, re.MULTILINE)
    if m:
        return m.start()
    m = re.search(r'^if\s+__name__', content, re.MULTILINE)
    if m:
        return m.start()
    return len(content)


def cleanup_verb_body(verb_part):
    """Remove cdp_utils helper calls, browser.close(), and fix empty try blocks."""
    
    # Remove cdp_utils helper calls
    verb_part = re.sub(r'^\s+profile_dir\s*=\s*get_temp_profile_dir\([^)]*\)\s*\n', '', verb_part, flags=re.MULTILINE)
    verb_part = re.sub(r'^\s+chrome_proc\s*=\s*launch_chrome\([^)]*\)\s*\n', '', verb_part, flags=re.MULTILINE)
    verb_part = re.sub(r'^\s+ws_url\s*=\s*wait_for_cdp_ws\([^)]*\)\s*\n', '', verb_part, flags=re.MULTILINE)
    
    # Remove port = get_free_port() if still present
    verb_part = re.sub(r'^\s+port\s*=\s*get_free_port\(\)\s*\n', '', verb_part, flags=re.MULTILINE)
    
    # Remove browser.close() calls
    verb_part = re.sub(r'^\s+browser\.close\(\)\s*\n', '', verb_part, flags=re.MULTILINE)
    
    # Remove chrome_proc.terminate/kill
    verb_part = re.sub(r'^\s+chrome_proc\.terminate\(\)\s*\n', '', verb_part, flags=re.MULTILINE)
    verb_part = re.sub(r'^\s+chrome_proc\.kill\(\)\s*\n', '', verb_part, flags=re.MULTILINE)
    
    # Remove shutil.rmtree(profile_dir, ...)
    verb_part = re.sub(r'^\s+shutil\.rmtree\(profile_dir[^)]*\)\s*\n', '', verb_part, flags=re.MULTILINE)
    
    # Fix empty try: blocks (try:\n        except)
    # Pattern: try:\n            except Exception:\n            pass
    verb_part = re.sub(
        r'^\s+try:\s*\n\s+except\s+Exception[^:]*:\s*\n\s+pass\s*\n',
        '', verb_part, flags=re.MULTILINE
    )
    
    # Also handle: try:\n            except:\n            pass
    verb_part = re.sub(
        r'^\s+try:\s*\n\s+except:\s*\n\s+pass\s*\n',
        '', verb_part, flags=re.MULTILINE
    )
    
    # Clean up empty finally blocks
    lines = verb_part.split('\n')
    result = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped == 'finally:':
            indent = len(lines[i]) - len(lines[i].lstrip())
            # Check if next non-blank line is at same or less indent (empty finally)
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
                i += 1
                continue
        result.append(lines[i])
        i += 1
    verb_part = '\n'.join(result)
    
    return verb_part


def process_file(filepath):
    dirname = os.path.basename(os.path.dirname(filepath))
    fname = os.path.basename(filepath)
    label = f"{dirname}/{fname}"
    
    content = open(filepath, "r", encoding="utf-8").read()
    original = content
    
    verb_end = find_verb_end(content)
    verb_part = content[:verb_end]
    rest_part = content[verb_end:]
    
    new_verb = cleanup_verb_body(verb_part)
    
    if new_verb != verb_part:
        content = new_verb + rest_part
        # Clean up excessive blank lines
        content = re.sub(r'\n{4,}', '\n\n\n', content)
        open(filepath, "w", encoding="utf-8").write(content)
        print(f"  FIXED: {label}")
        return True
    return False


def main():
    files = get_files()
    fixed = 0
    for f in files:
        try:
            if process_file(f):
                fixed += 1
        except Exception as e:
            print(f"  ERROR: {os.path.basename(os.path.dirname(f))}/{os.path.basename(f)}: {e}")
    print(f"\nFixed {fixed} files")


if __name__ == "__main__":
    main()
