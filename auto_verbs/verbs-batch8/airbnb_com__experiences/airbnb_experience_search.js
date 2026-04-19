const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Airbnb Experiences – Search experiences by city
 *
 * Navigates to Airbnb Experiences, searches for a city,
 * and extracts experience listings.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  city: "Tokyo, Japan",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Airbnb Experiences – Search experiences by city

Generated on: ${ts}
Recorded ${n} browser interactions

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ExperienceSearchRequest:
    city: str = "${cfg.city}"
    max_results: int = ${cfg.maxResults}


@dataclass
class ExperienceItem:
    title: str = ""
    host_name: str = ""
    duration: str = ""
    price_per_person: str = ""
    rating: str = ""
    num_reviews: str = ""


@dataclass
class ExperienceSearchResult:
    items: List[ExperienceItem] = field(default_factory=list)


# Search for Airbnb Experiences in a given city and extract listing details.
def airbnb_experience_search(page: Page, request: ExperienceSearchRequest) -> ExperienceSearchResult:
    """Search Airbnb Experiences for a city and extract listings."""
    print(f"  City: {request.city}\\n")

    # ── Navigate to Airbnb Experiences ─────────────────────────────────
    encoded = quote_plus(request.city)
    url = f"https://www.airbnb.com/s/{encoded}/experiences"
    print(f"Loading {url}...")
    checkpoint("Navigate to Airbnb Experiences")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = ExperienceSearchResult()

    # ── Extract experience listings ───────────────────────────────────
    checkpoint("Extract experience listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[itemprop="itemListElement"], [data-testid="card-container"], div[id^="experience"]');
        const items = [];
        const seen = new Set();

        // Try multiple selectors for experience cards
        const allLinks = document.querySelectorAll('a[href*="/experiences/"]');
        for (const a of allLinks) {
            if (items.length >= max) break;
            const card = a.closest('[itemprop="itemListElement"]') || a.closest('div[class]');
            if (!card || seen.has(card)) continue;
            seen.add(card);

            const text = card.innerText.trim();
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 2) continue;

            // Parse card text
            let title = '';
            let hostName = '';
            let duration = '';
            let price = '';
            let rating = '';
            let numReviews = '';

            // Title is usually the link text or first prominent line
            title = a.textContent.trim() || lines[0];

            for (const line of lines) {
                if (line.match(/hosted\\s+by/i)) {
                    hostName = line.replace(/hosted\\s+by\\s*/i, '').trim();
                }
                if (line.match(/\\d+\\s*(hour|min|day)/i)) {
                    duration = line;
                }
                if (line.match(/\\$\\d+|From\\s*\\$/i)) {
                    price = line;
                }
                if (line.match(/^[\\d.]+\\s*\\(/)) {
                    const m = line.match(/^([\\d.]+)\\s*\\(([\\d,]+)/);
                    if (m) {
                        rating = m[1];
                        numReviews = m[2];
                    }
                }
                if (line.match(/^\\d+\\.\\d+$/) && !rating) {
                    rating = line;
                }
            }

            if (title.length > 5) {
                items.push({title, host_name: hostName, duration, price_per_person: price, rating, num_reviews: numReviews});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ExperienceItem()
        item.title = d.get("title", "")
        item.host_name = d.get("host_name", "")
        item.duration = d.get("duration", "")
        item.price_per_person = d.get("price_per_person", "")
        item.rating = d.get("rating", "")
        item.num_reviews = d.get("num_reviews", "")
        result.items.append(item)

    # ── Print results ─────────────────────────────────────────────────
    for i, item in enumerate(result.items, 1):
        print(f"\\n  Experience {i}:")
        print(f"    Title:          {item.title}")
        print(f"    Host:           {item.host_name}")
        print(f"    Duration:       {item.duration}")
        print(f"    Price/Person:   {item.price_per_person}")
        print(f"    Rating:         {item.rating}")
        print(f"    Reviews:        {item.num_reviews}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("airbnb_experiences")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = ExperienceSearchRequest()
            result = airbnb_experience_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} experiences")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({
    env: "LOCAL",
    llmClient,
    headless: false,
  });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    // Navigate to Airbnb Experiences
    const encoded = encodeURIComponent(CFG.city);
    const searchUrl = `https://www.airbnb.com/s/${encoded}/experiences`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", searchUrl, `Navigate to ${searchUrl}`);
    await page.waitForTimeout(CFG.waits.page);

    // Extract results
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} experience listings. For each get the title, host name, duration, price per person, rating, and number of reviews.`
    );
    recorder.record("extract", "experience listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    // Save
    const outDir = __dirname;
    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "airbnb_experience_search.py"), pyCode);
    console.log("Saved airbnb_experience_search.py");
  } finally {
    await stagehand.close();
  }
})();
