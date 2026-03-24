"""
Regenerate all signature.txt files from their corresponding Python verb scripts.
Each signature.txt contains:
  - A comment description (lines immediately before the main verb function)
  - All @dataclass(frozen=True) definitions
  - The main function signature (no body)
"""
import os
import re

VERBS_DIR = os.path.dirname(os.path.abspath(__file__))

# Files to exclude when searching for the main verb Python file
EXCLUDE_FILES = {
    "__init__.py", "_debug.py", "cdp_utils.py", "open_browser.py",
    "cleanup.py", "convert_to_cdp.py", "convert_clicks.py",
    "fix_js_genpython.py", "refactor_verbs.py", "refactor_all.py",
    "refactor2.py", "do_refactor.py", "regen_sigs.py", "regen_signatures.py",
}


def find_main_py(folder_path: str) -> str | None:
    """Find the primary verb Python file in a folder."""
    candidates = []
    for f in os.listdir(folder_path):
        if not f.endswith(".py"):
            continue
        if f in EXCLUDE_FILES or f.startswith("_"):
            continue
        candidates.append(f)
    if len(candidates) == 1:
        return os.path.join(folder_path, candidates[0])
    # If multiple, prefer the one that contains 'page: Page'
    for f in candidates:
        path = os.path.join(folder_path, f)
        with open(path, encoding="utf-8") as fh:
            if "page: Page" in fh.read():
                return path
    return None


def extract_dataclass_blocks(lines: list[str]) -> list[str]:
    """Extract all @dataclass(frozen=True) class blocks as strings."""
    blocks = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped in ("@dataclass(frozen=True)", "@dataclass(frozen = True)"):
            block_lines = [lines[i].rstrip()]
            i += 1
            # class line
            while i < len(lines) and not lines[i].startswith("class "):
                i += 1
            if i >= len(lines):
                break
            block_lines.append(lines[i].rstrip())
            i += 1
            # field lines (indented)
            while i < len(lines):
                line = lines[i]
                if line.strip() == "" or (line and not line[0].isspace()):
                    break
                # Skip comment lines inside class body
                if line.strip().startswith("#"):
                    i += 1
                    continue
                block_lines.append(line.rstrip())
                i += 1
            blocks.append("\n".join(block_lines))
        else:
            i += 1
    return blocks


def extract_main_function(lines: list[str]) -> tuple[list[str], str] | tuple[None, None]:
    """
    Find the main verb function (not test_* or _*). Prefers page: Page functions,
    but falls back to any public non-helper function.
    Returns (description_comment_lines, function_signature_string).
    """
    candidates = []
    for i, line in enumerate(lines):
        m = re.match(r"^def (\w+)\s*\(", line)
        if not m:
            continue
        fname = m.group(1)
        if fname.startswith("test_") or fname.startswith("_"):
            continue
        lookahead = " ".join(lines[i : i + 6])
        has_page = "page: Page" in lookahead or "page:Page" in lookahead
        candidates.append((i, has_page))

    if not candidates:
        return None, None

    # Prefer a page: Page function; fall back to the first candidate
    chosen_i = next((i for i, hp in candidates if hp), candidates[0][0])

    for i, _ in [(chosen_i, None)]:

        # Gather comment description lines immediately before this def
        desc = []
        k = i - 1
        while k >= 0 and lines[k].startswith("#"):
            desc.insert(0, lines[k].rstrip())
            k -= 1

        # Build function signature up to closing ')' + return type, strip trailing ':'
        sig_parts = []
        j = i
        depth = 0
        found_close = False
        while j < len(lines):
            l = lines[j]
            sig_parts.append(l.strip())
            depth += l.count("(") - l.count(")")
            j += 1
            if depth <= 0:
                found_close = True
                break

        # If return type is on next line(s) after closing paren, grab it
        if found_close and j < len(lines):
            next_line = lines[j].strip()
            if next_line.startswith("->"):
                sig_parts.append(next_line)
                j += 1

        sig = " ".join(sig_parts)
        # Remove trailing colon and body
        sig = re.sub(r"\s*:\s*$", "", sig.strip())
        # Normalize whitespace
        sig = re.sub(r"\s+", " ", sig)
        # Clean up multi-line formatting: remove space after '(', trailing comma before ')'
        sig = re.sub(r"\(\s+", "(", sig)
        sig = re.sub(r",\s*\)", ")", sig)
        sig = re.sub(r"\s+\)", ")", sig)

        return desc, sig

    return None, None


def build_signature_txt(desc_lines: list[str], dataclass_blocks: list[str], func_sig: str) -> str:
    parts = []
    if desc_lines:
        parts.append("\n".join(desc_lines))
    parts.extend(dataclass_blocks)
    if func_sig:
        parts.append(func_sig)
    return "\n\n".join(parts) + "\n"


def process_folder(folder_path: str) -> str:
    sig_path = os.path.join(folder_path, "signature.txt")
    if not os.path.exists(sig_path):
        return "no signature.txt"

    py_path = find_main_py(folder_path)
    if not py_path:
        return "no main .py found"

    with open(py_path, encoding="utf-8") as f:
        lines = f.readlines()
    lines = [l.rstrip("\n") for l in lines]

    dataclass_blocks = extract_dataclass_blocks(lines)
    desc_lines, func_sig = extract_main_function(lines)

    if not func_sig:
        return f"could not find main function in {os.path.basename(py_path)}"

    new_content = build_signature_txt(desc_lines or [], dataclass_blocks, func_sig)

    with open(sig_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_content)

    return "ok"


def main():
    results = {}
    for entry in sorted(os.listdir(VERBS_DIR)):
        folder_path = os.path.join(VERBS_DIR, entry)
        if not os.path.isdir(folder_path) or entry.startswith("_"):
            continue
        result = process_folder(folder_path)
        results[entry] = result

    for name, status in results.items():
        print(f"  {name:45s}  {status}")


if __name__ == "__main__":
    main()
