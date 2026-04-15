"""
Auto-generated Playwright script (Python)
PubMed - Article Search
Query: CRISPR gene therapy

Generated on: 2026-04-15T21:58:32.184Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


ARTICLE_NUM_RE = re.compile(r'^\d+$')
JOURNAL_RE = re.compile(r'^(.+?)\. (\d{4}(?:\s+\w{3,4})?)')


def run(
    playwright: Playwright,
    query: str = "CRISPR gene therapy",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("pubmed_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = f"https://pubmed.ncbi.nlm.nih.gov/?term={quote_plus(query)}"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Skip to 'Search Results'
        i = 0
        while i < len(text_lines):
            if text_lines[i] == 'Search Results':
                i += 1
                break
            i += 1

        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]

            # Article number
            if ARTICLE_NUM_RE.match(line) and i + 4 < len(text_lines) and text_lines[i + 1] == 'Cite':
                title = text_lines[i + 2]
                authors = text_lines[i + 3]
                journal_line = text_lines[i + 4]

                # Parse journal name and date
                jm = JOURNAL_RE.match(journal_line)
                journal = jm.group(1) if jm else journal_line
                pub_date = jm.group(2) if jm else 'N/A'

                results.append({
                    'title': title,
                    'authors': authors,
                    'journal': journal,
                    'pub_date': pub_date,
                })
                i += 5
                continue

            i += 1

        print("=" * 60)
        print(f"PubMed: {query}")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['title']}")
            print(f"   Authors: {r['authors']}")
            print(f"   Journal: {r['journal']}")
            print(f"   Date:    {r['pub_date']}")

        print(f"\nFound {len(results)} articles")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        browser.close()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as pw:
        run(pw)