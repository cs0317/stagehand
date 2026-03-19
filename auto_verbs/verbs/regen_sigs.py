"""Regenerate signature.txt files from .py files for mismatched folders."""
import os
import re

FOLDERS = [
    'homedepot_com',
    'nytimes_com',
    'southwest_com',
    'spotify_com',
    'stackoverflow_com',
    'teams_microsoft_com',
    'trulia_com',
    'uber_com',
    'united_com',
    'usps_com',
    'webmd_com',
    'wikipedia_org',
    'youtube_com',
    'zillow_com',
]

skip_py = {
    'cdp_utils.py', 'open_browser.py', 'refactor_verbs.py', 'refactor_all.py',
    'refactor2.py', 'cleanup.py', 'do_refactor.py', 'fix_js_genpython.py',
    'convert_clicks.py', 'convert_to_cdp.py',
}

DRY_RUN = False  # Set False to actually write

# Override generic comments with better descriptions
COMMENT_OVERRIDES = {
    'homedepot_com': 'Searches Home Depot for products matching a query, returning up to max_results results with name, price, and rating.',
    'teams_microsoft_com': 'Sends a Microsoft Teams message to a recipient and returns success status.',
    'uber_com': 'Searches Uber for available ride options between a pickup and dropoff location, returning up to max_results estimates.',
    'wikipedia_org': 'Searches Wikipedia for an article and extracts its summary paragraph and key infobox facts.',
    'youtube_com': 'Searches YouTube for videos matching a query and returns the top max_results results.',
    'trulia_com': 'Searches Trulia for rental properties in a location and returns up to max_results listings.',
}

for folder in FOLDERS:
    dirpath = os.path.join('.', folder)
    fnames = os.listdir(dirpath)
    py_files = [f for f in fnames if f.endswith('.py') and f not in skip_py
                and not f.startswith('_debug') and not f.endswith('.bak')]
    if not py_files:
        print(f'SKIP: {folder} - no py file')
        continue
    pf = py_files[0]
    py_path = os.path.join(dirpath, pf)
    py_content = open(py_path, 'r', encoding='utf-8').read()

    # 1. Extract docstring for comment
    doc_m = re.match(r'^"""(.*?)"""', py_content, re.DOTALL)
    if doc_m:
        doc = doc_m.group(1).strip()
        doc_lines = doc.split('\n')
        comment = doc_lines[0].strip()
        # Remove site name prefix like 'NYTimes - '
        comment = re.sub(r'^[\w./\- ]+\s*[–—]\s*', '', comment)
        comment = comment.rstrip('.')
    else:
        comment = 'Verb function'

    # Apply comment overrides
    if folder in COMMENT_OVERRIDES:
        comment = COMMENT_OVERRIDES[folder].rstrip('.')

    # 2. Extract all @dataclass blocks
    dc_pattern = re.compile(
        r'(@dataclass(?:\([^)]*\))?)\s*\n(class\s+(\w+).*?:)\n((?:[ \t]+\w+.*\n)*)',
        re.MULTILINE,
    )
    all_classes = {}
    dc_blocks = []
    for m in dc_pattern.finditer(py_content):
        decorator = m.group(1)
        class_name = m.group(3)
        fields_raw = m.group(4)

        fields = []
        for line in fields_raw.splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            # Remove default: 'field: type = value' -> 'field: type'
            field_clean = re.sub(r'\s*=\s*.*$', '', line)
            # Remove inline comments
            field_clean = re.sub(r'\s*#.*$', '', field_clean)
            fields.append(field_clean)

        all_classes[class_name] = fields
        dc_blocks.append((decorator, class_name, fields))

    # 3. Find main verb function (last non-test, non-private def with return type)
    verb_m = None
    for m in re.finditer(
        r'^def\s+((?!test_|_)\w+)\s*\((.*?)\)\s*(->[\s\S]*?)?:',
        py_content,
        re.MULTILINE | re.DOTALL,
    ):
        func_name = m.group(1)
        ret_type = m.group(3)
        if ret_type:
            verb_m = m

    if not verb_m:
        for m in re.finditer(
            r'^def\s+((?!test_|_)\w+)\s*\((.*?)\)\s*(->[\s\S]*?)?:',
            py_content,
            re.MULTILINE | re.DOTALL,
        ):
            verb_m = m

    if not verb_m:
        print(f'SKIP: {folder} - no verb function found')
        continue

    func_name = verb_m.group(1)
    params_raw = verb_m.group(2)
    ret_type = verb_m.group(3).strip() if verb_m.group(3) else ''

    # Clean params
    params = []
    for p in re.split(r',', params_raw.replace('\n', ' ')):
        p = p.strip()
        if not p:
            continue
        p_clean = re.sub(r'\s*=\s*.*$', '', p)
        # Normalize 'object' type hints for dates to 'date'
        # (some files use 'object  # datetime.date')
        p_clean = re.sub(r':\s*object\b', ': date', p_clean)
        params.append(p_clean)
    params_str = ', '.join(params)

    # 4. Fix typed list references
    for _, dc_name, dc_fields in dc_blocks:
        for i, field in enumerate(dc_fields):
            if ': list' in field and '[' not in field:
                field_name = field.split(':')[0].strip()
                for cn in all_classes:
                    if cn.endswith('Request') or cn.endswith('Result'):
                        continue
                    # Match singular of field name to class name
                    singular = field_name.rstrip('s')
                    if singular.lower() in cn.lower() or cn.lower() in singular.lower():
                        dc_fields[i] = f'{field_name}: list[{cn}]'
                        break

    # Normalize 'object' in dataclass fields too
    for _, dc_name, dc_fields in dc_blocks:
        for i, field in enumerate(dc_fields):
            dc_fields[i] = re.sub(r':\s*object\b', ': date', field)

    # Also fix return type if it references 'object'
    ret_type = ret_type.replace('object', 'date') if ret_type else ret_type

    # 5. Build signature.txt content
    sig_lines = [f'# {comment}.', '']
    for dc_decorator, dc_name, dc_fields in dc_blocks:
        sig_lines.append(dc_decorator)
        sig_lines.append(f'class {dc_name}:')
        for f in dc_fields:
            sig_lines.append(f'    {f}')
        sig_lines.append('')

    ret_str = f' {ret_type}' if ret_type else ''
    sig_lines.append(f'def {func_name}({params_str}){ret_str}')
    sig_lines.append('')

    sig_content = '\n'.join(sig_lines)

    print(f'=== {folder}/signature.txt ===')
    print(sig_content)

    if not DRY_RUN:
        sig_path = os.path.join(dirpath, 'signature.txt')
        with open(sig_path, 'w', encoding='utf-8') as f:
            f.write(sig_content)
        print(f'  WRITTEN: {sig_path}')
    print()
