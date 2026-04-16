import re
import os
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint


DATE_RE = re.compile(r'^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d+, \d{4}$')


@dataclass(frozen=True)
class PypiSearchRequest:
    query: str = "web scraping"
    max_results: int = 5


@dataclass(frozen=True)
class PypiPackage:
    name: str = ""
    description: str = ""
    version: str = ""


@dataclass(frozen=True)
class PypiSearchResult:
    packages: tuple = ()


# Search for Python packages on PyPI by query and extract package name, description,
# and latest version for up to max_results packages.
def pypi_search(page: Page, request: PypiSearchRequest) -> PypiSearchResult:
    print(f"  Query: {request.query}\n")

    url = f"https://pypi.org/search/?q={quote_plus(request.query)}"
    print(f"Loading {url}...")
    page.set_viewport_size({"width": 1920, "height": 1080})
    checkpoint("Navigating to PyPI search results")
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    text = page.evaluate("document.body ? document.body.innerText : ''") or ""
    text_lines = [l.strip() for l in text.split("\n") if l.strip()]

    if any('CAPTCHA' in l or 'characters seen in the image' in l for l in text_lines):
        print("  WARNING: CAPTCHA detected. PyPI search blocks fresh CDP profiles.")
        print("  The JS/Stagehand version works correctly.")

    # Skip to search results
    i = 0
    while i < len(text_lines):
        if text_lines[i] == 'Search results':
            i += 1
            break
        i += 1

    # Skip count line and sort options
    while i < len(text_lines):
        if text_lines[i] in ('Relevance', 'Date last updated'):
            i += 1
            break
        i += 1

    # Parse packages: name, date, description
    parsed = []
    while i < len(text_lines) and len(parsed) < request.max_results:
        name = text_lines[i]
        if name == 'Previous' or name.isdigit():
            break
        date = text_lines[i + 1] if i + 1 < len(text_lines) else 'N/A'
        desc = text_lines[i + 2] if i + 2 < len(text_lines) else 'N/A'
        if DATE_RE.match(date):
            parsed.append({'name': name, 'description': desc})
            i += 3
        else:
            i += 1

    # Fetch version from PyPI JSON API
    results = []
    for pkg in parsed:
        checkpoint(f"Fetching version for {pkg['name']}")
        try:
            api_url = f"https://pypi.org/pypi/{pkg['name']}/json"
            version_js = f"fetch('{api_url}').then(r => r.json()).then(d => d.info.version).catch(() => 'N/A')"
            version = page.evaluate(version_js)
        except Exception:
            version = 'N/A'
        results.append(PypiPackage(
            name=pkg['name'],
            description=pkg['description'],
            version=version or 'N/A',
        ))

    print("=" * 60)
    print(f"PyPI: {request.query}")
    print("=" * 60)
    for idx, r in enumerate(results, 1):
        print(f"\n{idx}. {r.name} (v{r.version})")
        print(f"   {r.description}")

    print(f"\nFound {len(results)} packages")

    return PypiSearchResult(packages=tuple(results))


def test_func():
    import subprocess, time
    subprocess.call("taskkill /f /im chrome.exe", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    chrome_user_data = os.path.join(
        os.environ["USERPROFILE"], "AppData", "Local", "Google", "Chrome", "User Data", "Default"
    )
    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            chrome_user_data,
            channel="chrome",
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--disable-extensions",
            ],
        )
        page = context.pages[0] if context.pages else context.new_page()
        result = pypi_search(page, PypiSearchRequest())
        print(f"\nReturned {len(result.packages)} packages")
        context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)