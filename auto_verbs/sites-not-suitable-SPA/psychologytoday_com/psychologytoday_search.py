"""
Psychology Today – Search for therapists by location

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
class PsychologyTodaySearchRequest:
    location: str = "new-york-ny"
    max_results: int = 5


@dataclass
class PsychologyTodayTherapistItem:
    therapist_name: str = ""
    credentials: str = ""
    specialties: str = ""
    insurance_accepted: str = ""
    phone: str = ""
    verified_status: str = ""


@dataclass
class PsychologyTodaySearchResult:
    items: List[PsychologyTodayTherapistItem] = field(default_factory=list)


# Search for therapists on Psychology Today by location.
def psychologytoday_search(page: Page, request: PsychologyTodaySearchRequest) -> PsychologyTodaySearchResult:
    """Search for therapists on Psychology Today."""
    print(f"  Location: {request.location}\n")

    url = f"https://www.psychologytoday.com/us/therapists/{request.location}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Psychology Today therapist results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    result = PsychologyTodaySearchResult()

    checkpoint("Extract therapist listings")
    js_code = """(max) => {
        const items = [];
        // Look for profile cards with structured data
        const cards = document.querySelectorAll('.results-row, [class*="profile"], [data-testid*="result"]');
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('a[class*="profile-title"], h2 a, h3 a, [class*="name"] a');
            const credEl = card.querySelector('[class*="profile-subtitle"], [class*="credential"], [class*="suffix"]');
            const specEl = card.querySelector('[class*="profile-specialties"], [class*="specialt"]');
            if (!nameEl) continue;
            const text = nameEl.textContent.trim();
            if (!text || text.length < 3) continue;
            items.push({
                therapist_name: text,
                credentials: credEl ? credEl.textContent.trim() : '',
                specialties: specEl ? specEl.textContent.trim() : '',
                insurance_accepted: '',
                phone: '',
                verified_status: ''
            });
        }
        // Fallback: try any profile links
        if (items.length === 0) {
            const links = document.querySelectorAll('a[href*="/profile/"]');
            const seen = new Set();
            for (const a of links) {
                if (items.length >= max) break;
                const href = a.getAttribute('href') || '';
                if (seen.has(href)) continue;
                seen.add(href);
                const text = a.textContent.trim();
                if (!text || text.length < 3 || text.length > 100) continue;
                if (/^(Find|Search|Browse|Login|Sign|View)/i.test(text)) continue;
                items.push({therapist_name: text, credentials: '', specialties: '', insurance_accepted: '', phone: '', verified_status: ''});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = PsychologyTodayTherapistItem()
        item.therapist_name = d.get("therapist_name", "")
        item.credentials = d.get("credentials", "")
        item.specialties = d.get("specialties", "")
        item.insurance_accepted = d.get("insurance_accepted", "")
        item.phone = d.get("phone", "")
        item.verified_status = d.get("verified_status", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Therapist {i}:")
        print(f"    Name:        {item.therapist_name}")
        print(f"    Credentials: {item.credentials}")
        print(f"    Specialties: {item.specialties[:80]}...")
        print(f"    Insurance:   {item.insurance_accepted[:80]}...")
        print(f"    Phone:       {item.phone}")
        print(f"    Verified:    {item.verified_status}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("psychologytoday")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = PsychologyTodaySearchRequest()
            result = psychologytoday_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} therapists")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
