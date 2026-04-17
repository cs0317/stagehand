import re
import os
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class QuoraSearchRequest:
    query: str = "machine learning career advice"
    max_results: int = 5


@dataclass(frozen=True)
class QuoraThread:
    question_text: str = ""
    top_answer_author: str = ""
    num_answers: str = ""
    top_answer_snippet: str = ""


@dataclass(frozen=True)
class QuoraSearchResult:
    threads: list = None  # list[QuoraThread]


# Search Quora for Q&A threads by query and extract question text,
# top answer author, number of answers, and top answer snippet.
def quora_search(page: Page, request: QuoraSearchRequest) -> QuoraSearchResult:
    query = request.query
    max_results = request.max_results
    print(f"  Search query: {query}")
    print(f"  Max results: {max_results}\n")

    url = f"https://www.quora.com/search?q={quote_plus(query)}"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to Quora search for '{query}'")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    body_text = page.inner_text("body") or ""

    results = []

    # Try structured extraction via question link elements
    question_links = page.locator(
        'a[href*="/"][class*="question"], '
        'a[href*="/"][class*="Question"], '
        '[class*="SearchResult"] a, '
        '[class*="search_result"] a'
    )
    count = question_links.count()
    print(f"  Found {count} question links via selectors")

    seen_questions = set()

    if count > 0:
        for i in range(min(count, max_results * 3)):
            if len(results) >= max_results:
                break
            link = question_links.nth(i)
            try:
                link_text = link.inner_text(timeout=3000).strip()
                if not link_text or len(link_text) < 10:
                    continue
                # Skip duplicate questions
                if link_text in seen_questions:
                    continue
                # Skip non-question text (navigation, buttons, etc.)
                if re.match(r'^(Log in|Sign up|Search|Related|Answer|Follow)', link_text, re.I):
                    continue

                seen_questions.add(link_text)

                # Try to get surrounding context for answer info
                parent = link.locator("xpath=ancestor::*[5]")
                parent_text = ""
                try:
                    parent_text = parent.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                top_answer_author = "N/A"
                num_answers = "N/A"
                top_answer_snippet = "N/A"

                if parent_text:
                    lines = [l.strip() for l in parent_text.split("\n") if l.strip()]

                    # Look for answer count pattern
                    for line in lines:
                        am = re.search(r'(\d+)\s*answers?', line, re.I)
                        if am:
                            num_answers = am.group(1)
                            break

                    # Look for author name (short line, possibly after "Answer" or near question)
                    for line in lines:
                        if line == link_text:
                            continue
                        if re.match(r'^(Log in|Sign up|Search|Related|Follow|Upvote|Downvote|Share)', line, re.I):
                            continue
                        if len(line) > 3 and len(line) < 60 and not re.match(r'^[\d,]+$', line):
                            if top_answer_author == "N/A":
                                top_answer_author = line
                                continue

                    # Look for answer snippet (longer text that isn't the question)
                    for line in lines:
                        if line == link_text:
                            continue
                        if line == top_answer_author:
                            continue
                        if len(line) > 40:
                            top_answer_snippet = line[:200]
                            break

                results.append(QuoraThread(
                    question_text=link_text,
                    top_answer_author=top_answer_author,
                    num_answers=num_answers,
                    top_answer_snippet=top_answer_snippet,
                ))
            except Exception:
                continue

    # Fallback: text-based extraction from body
    if not results:
        print("  Selectors missed, trying text-based extraction...")
        text_lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            # Look for question-like lines (longer text, possibly ending with ?)
            is_question = (
                len(line) > 15
                and not re.match(r'^[\d,.$%]+$', line)
                and not re.match(r'^(Log in|Sign up|Search|Related|Answer|Follow|Upvote)', line, re.I)
                and ("?" in line or len(line) > 30)
            )

            if is_question and line not in seen_questions:
                seen_questions.add(line)
                question_text = line
                top_answer_author = "N/A"
                num_answers = "N/A"
                top_answer_snippet = "N/A"

                # Scan nearby lines for metadata
                for j in range(i + 1, min(len(text_lines), i + 10)):
                    nearby = text_lines[j]

                    # Answer count
                    am = re.search(r'(\d+)\s*answers?', nearby, re.I)
                    if am and num_answers == "N/A":
                        num_answers = am.group(1)
                        continue

                    # Short name-like line for author
                    if (len(nearby) > 2 and len(nearby) < 50
                            and not re.match(r'^[\d,]+$', nearby)
                            and not re.match(r'^(Log in|Sign up|Search|Related|Follow|Upvote)', nearby, re.I)
                            and top_answer_author == "N/A"):
                        top_answer_author = nearby
                        continue

                    # Longer line as answer snippet
                    if len(nearby) > 40 and top_answer_snippet == "N/A":
                        top_answer_snippet = nearby[:200]
                        continue

                results.append(QuoraThread(
                    question_text=question_text,
                    top_answer_author=top_answer_author,
                    num_answers=num_answers,
                    top_answer_snippet=top_answer_snippet,
                ))
                i += 8
                continue
            i += 1

        results = results[:max_results]

    print("=" * 60)
    print(f"Quora - Search Results for \"{query}\"")
    print("=" * 60)
    for idx, t in enumerate(results, 1):
        print(f"\n{idx}. {t.question_text}")
        print(f"   Top Answer Author: {t.top_answer_author}")
        print(f"   Num Answers: {t.num_answers}")
        print(f"   Snippet: {t.top_answer_snippet[:120]}...")

    print(f"\nFound {len(results)} threads")

    return QuoraSearchResult(threads=results)


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
            viewport=None,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--disable-extensions",
            ],
        )
        page = context.pages[0] if context.pages else context.new_page()
        result = quora_search(page, QuoraSearchRequest())
        print(f"\nReturned {len(result.threads or [])} threads")
        context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
