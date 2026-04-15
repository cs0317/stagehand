"""
Auto-generated Playwright script (Python)
arXiv.org – Search Research Papers
Query: transformer architecture
Max results: 5

Generated on: 2026-04-15T18:55:09.086Z
Recorded 5 browser interactions

Uses Playwright with CDP connection to a real Chrome instance.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "transformer architecture",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("arxiv_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading arXiv.org...")
        page.goto("https://arxiv.org")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── STEP 1: Enter search query ────────────────────────────────────
        print(f'STEP 1: Search for "{query}"...')

        # arXiv has a search input with name="query" and placeholder="Search..."
        search_input = page.locator('input[name="query"][aria-label="Search term or terms"]').first
        search_input.click()
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(query, delay=50)
        print(f'  Typed "{query}"')
        page.wait_for_timeout(1000)

        # ── STEP 2: Click Search ──────────────────────────────────────────
        print("STEP 2: Submitting search...")

        # The search form has a button with class "is-small is-cul-darker"
        search_btn = page.locator('form[action="https://arxiv.org/search"] button[type="submit"], form.mini-search button').first
        search_btn.click()
        print("  Clicked Search button")

        # Wait for results page
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  URL: {page.url}")

        # ── STEP 3: Extract papers ────────────────────────────────────────
        print(f"STEP 3: Extract up to {max_results} papers...")

        # arXiv results are in <li class="arxiv-result"> elements
        paper_cards = page.locator("li.arxiv-result")
        count = paper_cards.count()
        print(f"  Found {count} paper cards on page")

        for i in range(min(count, max_results)):
            card = paper_cards.nth(i)
            try:
                # Title: <p class="title is-5 mathjax">
                title = "N/A"
                try:
                    title_el = card.locator("p.title").first
                    title = title_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                # Authors: <p class="authors"> contains links
                authors = "N/A"
                try:
                    authors_el = card.locator("p.authors").first
                    authors_text = authors_el.inner_text(timeout=3000).strip()
                    # Remove the "Authors:" prefix
                    authors = re.sub(r"^Authors:\s*", "", authors_text).strip()
                except Exception:
                    pass

                # Abstract snippet: <span class="abstract-short">
                abstract = "N/A"
                try:
                    abstract_el = card.locator("span.abstract-short").first
                    abstract_text = abstract_el.inner_text(timeout=3000).strip()
                    # Remove trailing "▽ More" link text
                    abstract = re.sub(r"\s*▽\s*More\s*$", "", abstract_text).strip()
                    # Remove leading "…"
                    abstract = re.sub(r"^…\s*", "", abstract).strip()
                except Exception:
                    # Fallback: try the full abstract
                    try:
                        abstract_el = card.locator("p.abstract").first
                        abstract = abstract_el.inner_text(timeout=3000).strip()
                        abstract = re.sub(r"^Abstract:\s*", "", abstract).strip()
                        abstract = re.sub(r"\s*▽\s*More\s*$", "", abstract).strip()
                        abstract = re.sub(r"\s*△\s*Less\s*$", "", abstract).strip()
                    except Exception:
                        pass

                # Submission date: text like "Submitted 14 April, 2026;"
                date = "N/A"
                try:
                    # The date is in a <p class="is-size-7"> inside the card
                    date_els = card.locator("p.is-size-7")
                    for j in range(date_els.count()):
                        date_text = date_els.nth(j).inner_text(timeout=2000).strip()
                        m = re.search(r"Submitted\s+(.+?);", date_text)
                        if m:
                            date = m.group(1).strip()
                            break
                except Exception:
                    pass

                if title == "N/A":
                    continue

                results.append({
                    "title": title,
                    "authors": authors,
                    "abstract": abstract[:200] + ("..." if len(abstract) > 200 else ""),
                    "date": date,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nFound {len(results)} papers for '{query}':\n")
        for i, paper in enumerate(results, 1):
            print(f"  {i}. {paper['title']}")
            print(f"     Authors: {paper['authors']}")
            print(f"     Date: {paper['date']}")
            print(f"     Abstract: {paper['abstract']}")
            print()

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\nTotal papers found: {len(items)}")
