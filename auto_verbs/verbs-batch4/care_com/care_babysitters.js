/**
 * Care.com – Babysitter Search
 *
 * Prompt:
 *   Search for babysitters in "Austin, TX".
 *   Extract up to 5 caregiver profiles with name, years of experience,
 *   hourly rate, and rating or number of reviews.
 *
 * Strategy:
 *   Navigate to care.com, search for babysitters in the given location.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { setupLLMClient, PlaywrightRecorder, observeAndAct } = require("../../stagehand-utils");

const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

const CFG = {
  url: "https://www.care.com",
  location: "Austin, TX",
  maxItems: 5,
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Care.com – Babysitter Search
Search for babysitters and extract caregiver profiles.

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CareBabysittersRequest:
    location: str = "${cfg.location}"
    max_results: int = ${cfg.maxItems}


@dataclass(frozen=True)
class CaregiverProfile:
    name: str = ""
    years_of_experience: str = ""
    hourly_rate: str = ""
    rating_or_reviews: str = ""


@dataclass(frozen=True)
class CareBabysittersResult:
    profiles: list = None  # list[CaregiverProfile]


def care_babysitters(page: Page, request: CareBabysittersRequest) -> CareBabysittersResult:
    location = request.location
    max_results = request.max_results
    print(f"  Location: {location}")
    print(f"  Max profiles to extract: {max_results}\\n")

    url = "${cfg.url}"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)
    print(f"  Loaded: {page.url}")

    location_input = page.locator(
        'input[placeholder*="location" i], '
        'input[placeholder*="zip" i], '
        'input[placeholder*="city" i], '
        'input[placeholder*="where" i], '
        'input[name*="location" i], '
        'input[name*="address" i], '
        'input[id*="location" i]'
    )
    if location_input.count() > 0:
        print("  Found location input, entering location...")
        checkpoint("Enter location in search field")
        location_input.first.click()
        location_input.first.fill(location)
        page.wait_for_timeout(1500)
        page.keyboard.press("Enter")
        page.wait_for_timeout(3000)
    else:
        search_url = f"https://www.care.com/babysitters/{location.replace(' ', '-').replace(',', '')}"
        print(f"  No location input found, trying direct URL: {search_url}")
        checkpoint(f"Navigate to babysitter search for {location}")
        page.goto(search_url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

    print(f"  Current URL: {page.url}")

    body_text = page.evaluate("document.body ? document.body.innerText : ''") or ""

    results = []

    cards = page.locator(
        '[data-testid*="profile" i], '
        '[class*="provider-card" i], '
        '[class*="caregiver" i], '
        '[class*="profile-card" i], '
        '[class*="member-card" i], '
        '[class*="search-result" i]'
    )
    count = cards.count()
    print(f"  Found {count} profile cards via selectors")

    if count > 0:
        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                card_text = card.inner_text(timeout=3000).strip()
                lines = [l.strip() for l in card_text.split("\\n") if l.strip()]

                name = "N/A"
                years_of_experience = "N/A"
                hourly_rate = "N/A"
                rating_or_reviews = "N/A"

                for line in lines:
                    rm = re.search(r'\\$[\\d,.]+(?:\\s*[-\\u2013]\\s*\\$?[\\d,.]+)?(?:/\\s*hr)?', line, re.I)
                    if rm:
                        hourly_rate = rm.group(0)
                        continue
                    em = re.search(r'(\\d+)\\s*(?:\\+\\s*)?(?:yr|year)s?\\b', line, re.I)
                    if em:
                        years_of_experience = em.group(0)
                        continue
                    rating_m = re.search(r'(\\d+(?:\\.\\d+)?)\\s*(?:star|\\u2605)', line, re.I)
                    if rating_m:
                        rating_or_reviews = rating_m.group(0)
                        continue
                    review_m = re.search(r'(\\d+)\\s*review', line, re.I)
                    if review_m:
                        rating_or_reviews = review_m.group(0)
                        continue
                    if (name == "N/A"
                            and 2 <= len(line) <= 40
                            and not re.match(r'^[\\$\\d%]', line)
                            and not re.search(r'(mile|away|ago|job|review|year|hr)', line, re.I)):
                        name = line

                if name != "N/A":
                    results.append(CaregiverProfile(
                        name=name,
                        years_of_experience=years_of_experience,
                        hourly_rate=hourly_rate,
                        rating_or_reviews=rating_or_reviews,
                    ))
            except Exception:
                continue

    if not results:
        print("  Card selectors missed, trying text-based extraction...")
        text_lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            rm = re.search(r'\\$[\\d,.]+(?:\\s*[-\\u2013]\\s*\\$?[\\d,.]+)?(?:/\\s*hr)?', line, re.I)
            if rm:
                hourly_rate = rm.group(0)
                name = "N/A"
                years_of_experience = "N/A"
                rating_or_reviews = "N/A"

                for j in range(max(0, i - 5), min(len(text_lines), i + 5)):
                    nearby = text_lines[j]
                    em = re.search(r'(\\d+)\\s*(?:\\+\\s*)?(?:yr|year)s?\\b', nearby, re.I)
                    if em:
                        years_of_experience = em.group(0)
                    rating_m = re.search(r'(\\d+(?:\\.\\d+)?)\\s*(?:star|\\u2605)', nearby, re.I)
                    if rating_m:
                        rating_or_reviews = rating_m.group(0)
                    review_m = re.search(r'(\\d+)\\s*review', nearby, re.I)
                    if review_m and rating_or_reviews == "N/A":
                        rating_or_reviews = review_m.group(0)
                    if (name == "N/A"
                            and 2 <= len(nearby) <= 40
                            and not re.match(r'^[\\$\\d%]', nearby)
                            and not re.search(r'(mile|away|ago|job|review|year|hr|\\$)', nearby, re.I)
                            and nearby != line):
                        name = nearby

                if name != "N/A" or hourly_rate != "N/A":
                    results.append(CaregiverProfile(
                        name=name,
                        years_of_experience=years_of_experience,
                        hourly_rate=hourly_rate,
                        rating_or_reviews=rating_or_reviews,
                    ))
            i += 1

    print("=" * 60)
    print(f"Care.com - Babysitters in {location}")
    print("=" * 60)
    for idx, p in enumerate(results, 1):
        print(f"\\n{idx}. {p.name}")
        print(f"   Experience: {p.years_of_experience}")
        print(f"   Rate: {p.hourly_rate}")
        print(f"   Rating/Reviews: {p.rating_or_reviews}")

    print(f"\\nFound {len(results)} caregiver profiles")

    return CareBabysittersResult(profiles=results)


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
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--disable-extensions",
            ],
        )
        page = context.pages[0] if context.pages else context.new_page()
        result = care_babysitters(page, CareBabysittersRequest())
        print(f"\\nReturned {len(result.profiles or [])} profiles")
        context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

/* ── main ────────────────────────────────────────────────── */
(async () => {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    localBrowserLaunchOptions: {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    },
  });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    console.log("🌐 Navigating to Care.com...");
    recorder.record("navigate", { url: CFG.url });
    await page.goto(CFG.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied")) {
      console.log("🚫 Bot detection triggered. Stopping.");
      process.exit(1);
    }

    console.log(`🔍 Searching for babysitters in "${CFG.location}"...`);
    await stagehand.act(`Search for babysitters in "${CFG.location}"`);
    await page.waitForTimeout(5000);

    console.log(`🎯 Extracting up to ${CFG.maxItems} profiles...`);
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} caregiver profiles from this Care.com search results page. For each profile get: name, years of experience, hourly rate, and rating or number of reviews.`,
      z.object({
        profiles: z.array(z.object({
          name: z.string(),
          years_of_experience: z.string(),
          hourly_rate: z.string(),
          rating_or_reviews: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${data.profiles.length} profiles:`);
    data.profiles.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name}`);
      console.log(`     Experience: ${p.years_of_experience}  Rate: ${p.hourly_rate}  Rating: ${p.rating_or_reviews}`);
    });

    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "care_babysitters.py");
    fs.writeFileSync(pyPath, pyCode, "utf-8");
    console.log(`\n📄 Python script written to: ${pyPath}`);

    const actionsPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Recorded actions: ${actionsPath}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
