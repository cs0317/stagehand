"""Playwright script (Python) — Quora Question Search"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class QuoraRequest:
    query: str = "machine learning career"
    max_results: int = 5

@dataclass
class QuestionItem:
    question: str = ""
    num_answers: str = ""
    followers: str = ""
    top_answer_author: str = ""
    top_answer_upvotes: str = ""

@dataclass
class QuoraResult:
    questions: List[QuestionItem] = field(default_factory=list)

def search_quora(page: Page, request: QuoraRequest) -> QuoraResult:
    url = f"https://www.quora.com/search?q={request.query.replace(' ', '+')}"
    checkpoint("Navigate to Quora search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = QuoraResult()
    js_code = """(max) => {
        const results = [];
        const items = document.querySelectorAll('[class*="question"], [class*="QuestionRow"]');
        for (const item of items) {
            if (results.length >= max) break;
            const qEl = item.querySelector('span[class*="content"], a');
            const q = qEl ? qEl.textContent.trim() : '';
            if (!q || q.length < 10) continue;
            results.push({ question: q, num_answers: '', followers: '', top_answer_author: '', top_answer_upvotes: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = QuestionItem()
        item.question = d.get("question", "")
        item.num_answers = d.get("num_answers", "")
        result.questions.append(item)
    print(f"Found {len(result.questions)} questions")
    for i, q in enumerate(result.questions, 1):
        print(f"  {i}. {q.question[:80]}")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("quora")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_quora(page, QuoraRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
