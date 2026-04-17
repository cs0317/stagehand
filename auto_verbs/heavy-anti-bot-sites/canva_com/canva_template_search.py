import re
import os
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class CanvaTemplateSearchRequest:
    search_query: str = "business presentation"
    max_results: int = 5

@dataclass(frozen=True)
class CanvaTemplate:
    template_name: str = ""
    category: str = ""
    dimensions: str = ""
    is_free: str = ""

@dataclass(frozen=True)
class CanvaTemplateSearchResult:
    templates: list = None  # list[CanvaTemplate]

# Search for design templates on Canva matching a query and extract template
# name, category, dimensions or format, and whether it is free or pro.
def canva_template_search(page: Page, request: CanvaTemplateSearchRequest) -> CanvaTemplateSearchResult:
    search_query = request.search_query
    max_results = request.max_results
    print(f"  Search query: {search_query}")
    print(f"  Max templates to extract: {max_results}\n")

    url = "https://www.canva.com"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    print(f"  Loaded: {page.url}")

    # Look for the search input and type the query
    search_input = page.locator(
        'input[type="search"], '
        'input[placeholder*="Search"], '
        'input[aria-label*="Search"], '
        'input[data-testid*="search"]'
    )
    if search_input.count() > 0:
        checkpoint(f"Type '{search_query}' into search box")
        search_input.first.click(timeout=5000)
        search_input.first.fill(search_query)
        page.keyboard.press("Enter")
        page.wait_for_timeout(5000)
        print(f"  Searched for: {search_query}")
    else:
        # Fallback: navigate directly to search URL
        search_url = f"https://www.canva.com/search/templates?q={search_query.replace(' ', '%20')}"
        print(f"  Search input not found, navigating to {search_url}")
        checkpoint(f"Navigate to search URL for '{search_query}'")
        page.goto(search_url, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)

    print(f"  Current URL: {page.url}")

    results = []

    # Try structured extraction via template card elements
    cards = page.locator(
        '[class*="TemplateCard"], '
        '[data-testid*="template"], '
        '[class*="template-card"], '
        '[class*="DesignCard"], '
        'a[href*="/templates/"]'
    )
    count = cards.count()
    print(f"  Found {count} template cards via selectors")

    if count > 0:
        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                card_text = card.inner_text(timeout=3000).strip()
                lines = [l.strip() for l in card_text.split("\n") if l.strip()]

                template_name = "N/A"
                category = "N/A"
                dimensions = "N/A"
                is_free = "N/A"

                for line in lines:
                    low = line.lower()
                    # Check for Pro/Free indicator
                    if re.search(r'\bpro\b', low):
                        is_free = "Pro"
                        continue
                    if re.search(r'\bfree\b', low):
                        is_free = "Free"
                        continue
                    # Dimensions pattern (e.g., "1920 × 1080 px", "16:9")
                    dm = re.search(r'\d+\s*[×x]\s*\d+', line)
                    if dm:
                        dimensions = line
                        continue
                    ratio = re.search(r'\d+:\d+', line)
                    if ratio:
                        dimensions = line
                        continue
                    # Category keywords
                    if any(kw in low for kw in [
                        'presentation', 'infographic', 'poster', 'flyer',
                        'social media', 'instagram', 'facebook', 'logo',
                        'resume', 'invitation', 'brochure', 'banner',
                        'video', 'whiteboard', 'doc', 'card',
                    ]):
                        if category == "N/A":
                            category = line
                        continue
                    # Template name: longest descriptive line
                    if len(line) > 3 and not re.match(r'^[\d%$]', line):
                        if template_name == "N/A" or len(line) > len(template_name):
                            template_name = line

                if template_name != "N/A":
                    results.append(CanvaTemplate(
                        template_name=template_name,
                        category=category,
                        dimensions=dimensions,
                        is_free=is_free,
                    ))
            except Exception:
                continue

    # Fallback: text-based extraction from page body
    if not results:
        print("  Card selectors missed, trying text-based extraction...")
        body_text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            low = line.lower()

            # Anchor on lines that look like template names (longer descriptive text)
            if len(line) > 15 and not re.match(r'^[\d%$]', line) and "canva" not in low:
                template_name = line
                category = "N/A"
                dimensions = "N/A"
                is_free = "N/A"

                # Search nearby lines for metadata
                for j in range(max(0, i - 2), min(len(text_lines), i + 5)):
                    nearby = text_lines[j]
                    nearby_low = nearby.lower()
                    if re.search(r'\bpro\b', nearby_low) and is_free == "N/A":
                        is_free = "Pro"
                    elif re.search(r'\bfree\b', nearby_low) and is_free == "N/A":
                        is_free = "Free"
                    dm = re.search(r'\d+\s*[×x]\s*\d+', nearby)
                    if dm and dimensions == "N/A":
                        dimensions = nearby
                    ratio = re.search(r'\d+:\d+', nearby)
                    if ratio and dimensions == "N/A":
                        dimensions = nearby
                    if any(kw in nearby_low for kw in [
                        'presentation', 'infographic', 'poster', 'flyer',
                        'social media', 'instagram', 'logo', 'resume',
                    ]) and category == "N/A" and nearby != line:
                        category = nearby

                results.append(CanvaTemplate(
                    template_name=template_name,
                    category=category,
                    dimensions=dimensions,
                    is_free=is_free,
                ))
            i += 1

    print("=" * 60)
    print(f"Canva – Template Search: '{search_query}'")
    print("=" * 60)
    for idx, t in enumerate(results, 1):
        print(f"\n{idx}. {t.template_name}")
        print(f"   Category: {t.category}")
        print(f"   Dimensions: {t.dimensions}")
        print(f"   Access: {t.is_free}")

    print(f"\nFound {len(results)} templates")

    return CanvaTemplateSearchResult(templates=results)

def test_func():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="chrome",
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = browser.new_page()
        result = canva_template_search(page, CanvaTemplateSearchRequest())
        print(f"\nReturned {len(result.templates or [])} templates")
        browser.close()

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
