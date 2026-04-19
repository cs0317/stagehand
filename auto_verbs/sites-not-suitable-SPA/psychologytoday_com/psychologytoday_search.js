const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Psychology Today – Search for therapists by location
 */

const CFG = {
  location: "new-york-ny",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Psychology Today – Search for therapists by location

Generated on: ${ts}
Recorded ${n} browser interactions
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
    location: str = "${cfg.location}"
    max_results: int = ${cfg.maxResults}


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
    print(f"  Location: {request.location}\\n")

    url = f"https://www.psychologytoday.com/us/therapists/{request.location}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Psychology Today therapist results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = PsychologyTodaySearchResult()

    checkpoint("Extract therapist listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="result-row"], [class*="therapist"], [class*="ProfileCard"], [class*="listing"], .results-row');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h2, h3, [class*="name"], [class*="profile-title"], a[class*="name"]');
            const credEl = card.querySelector('[class*="credential"], [class*="license"], [class*="suffix"], [class*="title-suffix"]');
            const specEl = card.querySelector('[class*="specialt"], [class*="focus"], [class*="issues"]');
            const insEl = card.querySelector('[class*="insurance"], [class*="accepted"], [class*="finances"]');
            const phoneEl = card.querySelector('[class*="phone"], a[href^="tel:"]');
            const verifiedEl = card.querySelector('[class*="verified"], [class*="badge"], [class*="check"]');

            const therapist_name = nameEl ? nameEl.textContent.trim() : '';
            const credentials = credEl ? credEl.textContent.trim() : '';
            const specialties = specEl ? specEl.textContent.trim() : '';
            const insurance_accepted = insEl ? insEl.textContent.trim() : '';
            const phone = phoneEl ? phoneEl.textContent.trim() : '';
            const verified_status = verifiedEl ? verifiedEl.textContent.trim() : '';

            if (therapist_name) {
                items.push({therapist_name, credentials, specialties, insurance_accepted, phone, verified_status});
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
        print(f"\\n  Therapist {i}:")
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
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} therapists")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const url = `https://www.psychologytoday.com/us/therapists/${CFG.location}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} therapist listings. For each get the therapist name, credentials, specialties, insurance accepted, phone number, and verified status.`
    );
    recorder.record("extract", "therapist listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "psychologytoday_search.py"), genPython(CFG, recorder));
    console.log("Saved psychologytoday_search.py");
  } finally {
    await stagehand.close();
  }
})();
