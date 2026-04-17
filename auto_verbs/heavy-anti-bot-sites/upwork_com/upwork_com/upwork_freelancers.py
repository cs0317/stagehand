"""
Upwork – Freelancer Search verb
Search Upwork for freelancers with a given skill and extract profiles.
"""

import re
import os
from dataclasses import dataclass
from urllib.parse import quote as url_quote
from playwright.sync_api import Page, sync_playwright

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint

# ── Types ─────────────────────────────────────────────────────────────────────

@dataclass
class UpworkSearchRequest:
    skill: str          # e.g. "Python developer"
    max_results: int    # number of freelancer profiles to extract

@dataclass
class UpworkFreelancer:
    name: str               # freelancer name
    title: str              # headline / title
    hourly_rate: str        # e.g. "$50.00/hr"
    job_success_score: str  # e.g. "95% Job Success"
    total_earnings: str     # e.g. "$100K+ earned"

@dataclass
class UpworkSearchResult:
    freelancers: list  # list of UpworkFreelancer

# ── Verb ──────────────────────────────────────────────────────────────────────

def upwork_freelancer_search(page: Page, request: UpworkSearchRequest) -> UpworkSearchResult:
    """
    Search Upwork for freelancers with a given skill and extract profiles.

    Args:
        page: Playwright page.
        request: UpworkSearchRequest with skill and max_results.

    Returns:
        UpworkSearchResult containing a list of UpworkFreelancer.
    """
    search_url = f"https://www.upwork.com/search/profiles/?q={url_quote(request.skill)}"
    print(f"Loading {search_url}...")
    page.goto(search_url)
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_timeout(3000)
    print(f"  Loaded: {page.url}")
    checkpoint("Loaded Upwork search page")

    # Check for bot detection / blocking
    title = page.title().lower()
    body_text_start = (page.evaluate("document.body.innerText") or "")[:500].lower()
    if "blocked" in title or "403" in title or "captcha" in body_text_start or "verify" in body_text_start:
        print("  BLOCKED: Heavy bot-detection detected. Skipping.")
        return UpworkSearchResult(freelancers=[])

    # Dismiss cookie banners
    for selector in [
        'button#onetrust-accept-btn-handler',
        'button:has-text("Accept")',
        'button:has-text("Accept Cookies")',
        'button:has-text("Got it")',
    ]:
        try:
            btn = page.locator(selector).first
            if btn.is_visible(timeout=1500):
                btn.click()
                page.wait_for_timeout(500)
                break
        except Exception:
            pass

    # Extract freelancer profiles
    print(f"Extracting up to {request.max_results} freelancer profiles...")

    profile_cards = page.locator(
        '[data-test="freelancer-card"], '
        '[data-test="FreelancerCard"], '
        'section[data-test="profile-tile"], '
        '[class*="freelancer-tile"], '
        'article[class*="profile"]'
    )
    count = profile_cards.count()
    print(f"  Found {count} profile cards")

    if count == 0:
        profile_cards = page.locator('div[data-ev-label*="search_results"] > div, .up-card-section')
        count = profile_cards.count()
        print(f"  Fallback: found {count} cards")

    results = []
    seen_names = set()
    for i in range(count):
        if len(results) >= request.max_results:
            break
        card = profile_cards.nth(i)
        try:
            # Name
            name = "N/A"
            try:
                name_el = card.locator(
                    '[data-test="freelancer-name"], '
                    '[class*="freelancer-name"], '
                    'h4, h3, '
                    'a[class*="name"]'
                ).first
                name = name_el.inner_text(timeout=2000).strip()
            except Exception:
                pass
            if name == "N/A" or name.lower() in seen_names:
                continue
            seen_names.add(name.lower())

            # Title/headline
            title_text = "N/A"
            try:
                title_el = card.locator(
                    '[data-test="freelancer-title"], '
                    '[class*="freelancer-title"], '
                    '[class*="headline"], '
                    'p[class*="title"]'
                ).first
                title_text = title_el.inner_text(timeout=2000).strip()
            except Exception:
                pass

            # Hourly rate
            hourly_rate = "N/A"
            try:
                rate_el = card.locator(
                    '[data-test="rate"], '
                    '[class*="rate"], '
                    'span:has-text("/hr")'
                ).first
                hourly_rate = rate_el.inner_text(timeout=2000).strip()
                rm = re.search(r"\$[\d.,]+/hr", hourly_rate)
                if rm:
                    hourly_rate = rm.group(0)
            except Exception:
                pass

            # Job success score
            job_success = "N/A"
            try:
                js_el = card.locator(
                    '[data-test="job-success"], '
                    '[class*="job-success"], '
                    'span:has-text("% Job Success")'
                ).first
                job_success = js_el.inner_text(timeout=2000).strip()
            except Exception:
                pass

            # Total earnings
            earnings = "N/A"
            try:
                earn_el = card.locator(
                    '[data-test="earned"], '
                    '[class*="earned"], '
                    'span:has-text("earned")'
                ).first
                earnings = earn_el.inner_text(timeout=2000).strip()
            except Exception:
                pass

            results.append(UpworkFreelancer(
                name=name,
                title=title_text,
                hourly_rate=hourly_rate,
                job_success_score=job_success,
                total_earnings=earnings,
            ))
        except Exception:
            continue

    # Fallback: parse page text
    if not results:
        print("  Card extraction failed, trying text fallback...")
        body = page.evaluate("document.body.innerText") or ""
        lines = body.split("\n")
        for i, line in enumerate(lines):
            if len(results) >= request.max_results:
                break
            rate_m = re.search(r"\$[\d.,]+/hr", line)
            if rate_m:
                name = "N/A"
                title_text = "N/A"
                for j in range(max(0, i - 5), i):
                    c = lines[j].strip()
                    if c and len(c) > 3 and "$" not in c:
                        if name == "N/A":
                            name = c
                        else:
                            title_text = c
                if name != "N/A":
                    results.append(UpworkFreelancer(
                        name=name,
                        title=title_text,
                        hourly_rate=rate_m.group(0),
                        job_success_score="N/A",
                        total_earnings="N/A",
                    ))

    checkpoint("Extracted freelancer profiles")
    print(f'\nFound {len(results)} freelancers for "{request.skill}":')
    for i, f in enumerate(results, 1):
        print(f"  {i}. {f.name}")
        print(f"     Title: {f.title}")
        print(f"     Rate: {f.hourly_rate}  Success: {f.job_success_score}  Earned: {f.total_earnings}")

    return UpworkSearchResult(freelancers=results)

# ── Test ──────────────────────────────────────────────────────────────────────

def test_func():

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="chrome",
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = browser.new_page()

        request = UpworkSearchRequest(skill="Python developer", max_results=5)
        result = upwork_freelancer_search(page, request)
        print(f"\nTotal freelancers found: {len(result.freelancers)}")

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
