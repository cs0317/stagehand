import os
import sys
import shutil
from dataclasses import dataclass, field
from typing import List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class USASpendingSearchRequest:
    search_query: str = "education"
    max_results: int = 5


@dataclass
class USASpendingAwardItem:
    recipient_name: str = ""
    award_amount: str = ""
    awarding_agency: str = ""
    award_type: str = ""
    date: str = ""
    description: str = ""


@dataclass
class USASpendingSearchResult:
    awards: List[USASpendingAwardItem] = field(default_factory=list)
    error: str = ""


def usaspending_search(page, request: USASpendingSearchRequest) -> USASpendingSearchResult:
    result = USASpendingSearchResult()
    try:
        url = "https://www.usaspending.gov/search"
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)

        checkpoint("Search page loaded")

        # Type search query into keyword input
        keyword_input = page.query_selector('input[type="text"], [class*="keyword"] input, #search-input')
        if keyword_input:
            keyword_input.fill(request.search_query)
            page.wait_for_timeout(500)

        # Click search/submit button
        submit_btn = page.query_selector('button[type="submit"], [class*="submit"], [class*="search-btn"]')
        if submit_btn:
            submit_btn.click()
            page.wait_for_timeout(3000)

        checkpoint("Search results loaded")

        awards_data = page.evaluate("""() => {
            const awards = [];
            const items = document.querySelectorAll('[class*="result"], [class*="award"], tr[class*="row"], .award-result');
            for (const item of items) {
                const recipientEl = item.querySelector('[class*="recipient"], [class*="name"], td:nth-child(1)');
                const amountEl = item.querySelector('[class*="amount"], [class*="value"], [class*="obligation"], td:nth-child(2)');
                const agencyEl = item.querySelector('[class*="agency"], [class*="department"], td:nth-child(3)');
                const typeEl = item.querySelector('[class*="type"], [class*="award-type"], td:nth-child(4)');
                const dateEl = item.querySelector('[class*="date"], time, td:nth-child(5)');
                const descEl = item.querySelector('[class*="description"], [class*="summary"], p');
                awards.push({
                    recipient_name: recipientEl ? recipientEl.textContent.trim() : '',
                    award_amount: amountEl ? amountEl.textContent.trim() : '',
                    awarding_agency: agencyEl ? agencyEl.textContent.trim() : '',
                    award_type: typeEl ? typeEl.textContent.trim() : '',
                    date: dateEl ? dateEl.textContent.trim() : '',
                    description: descEl ? descEl.textContent.trim() : '',
                });
            }
            return awards;
        }""")

        for item in awards_data[:request.max_results]:
            result.awards.append(USASpendingAwardItem(**item))

        checkpoint(f"Extracted {len(result.awards)} awards")

    except Exception as e:
        result.error = str(e)
    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir()
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    browser = pw.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()

    try:
        request = USASpendingSearchRequest()
        result = usaspending_search(page, request)
        print(f"Found {len(result.awards)} awards")
        for i, a in enumerate(result.awards):
            print(f"  {i+1}. {a.recipient_name} - {a.award_amount} from {a.awarding_agency}")
        if result.error:
            print(f"Error: {result.error}")
    finally:
        browser.close()
        pw.stop()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)


def run_with_debugger():
    test_func()


if __name__ == "__main__":
    run_with_debugger()
