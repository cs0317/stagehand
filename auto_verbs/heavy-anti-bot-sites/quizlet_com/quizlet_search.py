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
class QuizletSearchRequest:
    query: str = "AP Biology"
    max_results: int = 5


@dataclass(frozen=True)
class QuizletStudySet:
    title: str = ""
    creator_name: str = ""
    num_terms: str = ""
    num_learners: str = ""


@dataclass(frozen=True)
class QuizletSearchResult:
    study_sets: list = None  # list[QuizletStudySet]


# Search for study sets on Quizlet matching a query and extract
# title, creator name, number of terms, and number of learners.
def quizlet_search(page: Page, request: QuizletSearchRequest) -> QuizletSearchResult:
    query = request.query
    max_results = request.max_results
    print(f"  Search query: {query}")
    print(f"  Max results: {max_results}\n")

    url = f"https://quizlet.com/search?query={quote_plus(query)}&type=sets"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    body_text = page.inner_text("body") or ""

    results = []

    # Try structured extraction via study set card elements
    cards = page.locator(
        '[class*="SetCard"], '
        '[class*="set-card"], '
        '[class*="SearchResult"], '
        '[class*="search-result"], '
        'a[href*="/flashcards/"]'
    )
    count = cards.count()
    print(f"  Found {count} study set cards via selectors")

    if count > 0:
        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                card_text = card.inner_text(timeout=3000).strip()
                lines = [l.strip() for l in card_text.split("\n") if l.strip()]

                title = "N/A"
                creator_name = "N/A"
                num_terms = "N/A"
                num_learners = "N/A"

                for line in lines:
                    # Match "X terms" pattern
                    tm = re.search(r'(\d[\d,]*)\s+terms?', line, re.IGNORECASE)
                    if tm and num_terms == "N/A":
                        num_terms = tm.group(1)
                        continue
                    # Match "X learners" pattern
                    lm = re.search(r'(\d[\d,]*)\s+learners?', line, re.IGNORECASE)
                    if lm and num_learners == "N/A":
                        num_learners = lm.group(1)
                        continue
                    # Short line could be creator
                    if (len(line) > 1 and len(line) < 40
                            and not re.match(r'^[\d,]+$', line)
                            and creator_name == "N/A"
                            and title != "N/A"):
                        creator_name = line
                        continue
                    # Longer descriptive line is likely the title
                    if len(line) > 3 and not re.match(r'^[\d,]+$', line):
                        if title == "N/A" or len(line) > len(title):
                            if creator_name == "N/A" and title != "N/A":
                                creator_name = title
                            title = line

                if title != "N/A":
                    results.append(QuizletStudySet(
                        title=title,
                        creator_name=creator_name,
                        num_terms=num_terms,
                        num_learners=num_learners,
                    ))
            except Exception:
                continue

    # Fallback: text-based extraction
    if not results:
        print("  Card selectors missed, trying text-based extraction...")
        text_lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            # Look for "X terms" as an anchor
            tm = re.search(r'(\d[\d,]*)\s+terms?', line, re.IGNORECASE)
            if tm:
                num_terms = tm.group(1)
                title = "N/A"
                creator_name = "N/A"
                num_learners = "N/A"

                # Look backwards for title
                for j in range(i - 1, max(i - 5, -1), -1):
                    prev = text_lines[j]
                    if len(prev) > 5 and not re.match(r'^[\d,]+$', prev):
                        title = prev
                        break

                # Look forwards for creator and learners
                for j in range(i + 1, min(len(text_lines), i + 6)):
                    nearby = text_lines[j]
                    lm = re.search(r'(\d[\d,]*)\s+learners?', nearby, re.IGNORECASE)
                    if lm and num_learners == "N/A":
                        num_learners = lm.group(1)
                        continue
                    if (len(nearby) > 1 and len(nearby) < 40
                            and not re.match(r'^[\d,]+$', nearby)
                            and creator_name == "N/A"):
                        creator_name = nearby

                if title != "N/A":
                    results.append(QuizletStudySet(
                        title=title,
                        creator_name=creator_name,
                        num_terms=num_terms,
                        num_learners=num_learners,
                    ))
                    i += 5
                    continue
            i += 1

        results = results[:max_results]

    print("=" * 60)
    print(f"Quizlet - Search Results for \"{query}\"")
    print("=" * 60)
    for idx, s in enumerate(results, 1):
        print(f"\n{idx}. {s.title}")
        print(f"   Creator: {s.creator_name}")
        print(f"   Terms: {s.num_terms}")
        print(f"   Learners: {s.num_learners}")

    print(f"\nFound {len(results)} study sets")

    return QuizletSearchResult(study_sets=results)


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
        result = quizlet_search(page, QuizletSearchRequest())
        print(f"\nReturned {len(result.study_sets or [])} study sets")
        context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
