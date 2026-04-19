"""
Glassdoor – Search for interview questions and experiences

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class GlassdoorInterviewsSearchRequest:
    company_name: str = "Google"
    max_results: int = 5


@dataclass
class GlassdoorInterviewItem:
    company_name: str = ""
    position: str = ""
    difficulty_rating: str = ""
    interview_experience: str = ""
    question: str = ""
    answer: str = ""
    date: str = ""


@dataclass
class GlassdoorInterviewsSearchResult:
    items: List[GlassdoorInterviewItem] = field(default_factory=list)


# Search for interview questions and experiences on Glassdoor.
def glassdoor_interviews_search(page: Page, request: GlassdoorInterviewsSearchRequest) -> GlassdoorInterviewsSearchResult:
    """Search for interview questions and experiences on Glassdoor."""
    print(f"  Company: {request.company_name}")
    print(f"  Max results: {request.max_results}\n")

    url = f"https://www.glassdoor.com/Interview/{request.company_name}-interview-questions-SRCH_KE0,{len(request.company_name)}.htm"
    print(f"Loading {url}...")
    checkpoint("Navigate to Glassdoor interview questions page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = GlassdoorInterviewsSearchResult()

    checkpoint("Extract interview entries")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="interview"], [class*="Interview"], [data-test*="interview"], li[class*="empReview"], .interview-details');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const positionEl = card.querySelector('[class*="title"], [class*="Title"], h2, h3');
            const difficultyEl = card.querySelector('[class*="difficulty"], [class*="Difficulty"], [class*="rating"]');
            const experienceEl = card.querySelector('[class*="experience"], [class*="Experience"], [class*="outcome"]');
            const questionEl = card.querySelector('[class*="question"], [class*="Question"], [class*="mainText"], p');
            const answerEl = card.querySelector('[class*="answer"], [class*="Answer"], [class*="response"]');
            const dateEl = card.querySelector('[class*="date"], [class*="Date"], time, [class*="time"]');

            const position = positionEl ? positionEl.textContent.trim() : '';
            const difficulty_rating = difficultyEl ? difficultyEl.textContent.trim() : '';
            const interview_experience = experienceEl ? experienceEl.textContent.trim() : '';
            const question = questionEl ? questionEl.textContent.trim() : '';
            const answer = answerEl ? answerEl.textContent.trim() : '';
            const date = dateEl ? dateEl.textContent.trim() : '';

            if (position || question) {
                items.push({company_name: document.title.split(' ')[0] || '', position, difficulty_rating, interview_experience, question, answer, date});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = GlassdoorInterviewItem()
        item.company_name = d.get("company_name", "")
        item.position = d.get("position", "")
        item.difficulty_rating = d.get("difficulty_rating", "")
        item.interview_experience = d.get("interview_experience", "")
        item.question = d.get("question", "")
        item.answer = d.get("answer", "")
        item.date = d.get("date", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Interview {i}:")
        print(f"    Company:    {item.company_name}")
        print(f"    Position:   {item.position}")
        print(f"    Difficulty: {item.difficulty_rating}")
        print(f"    Experience: {item.interview_experience}")
        print(f"    Question:   {item.question[:80]}")
        print(f"    Answer:     {item.answer[:80]}")
        print(f"    Date:       {item.date}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("glassdoor_interviews")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = GlassdoorInterviewsSearchRequest()
            result = glassdoor_interviews_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} interview entries")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
