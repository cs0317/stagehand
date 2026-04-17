/**
 * Cars.com – Used Car Search
 *
 * Prompt:
 *   Search for used cars: make "Toyota", model "Camry", within 50 miles of zip code "60601".
 *   Extract up to 5 listings with title/year/model, price, mileage, dealer name, and location.
 *
 * Strategy:
 *   Direct URL: cars.com/shopping/results/?stock_type=used&makes[]=...
 *   Then extract vehicle cards.
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
  make: "Toyota",
  model: "Camry",
  zip: "60601",
  distance: 50,
  maxItems: 5,
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Cars.com – Used Car Search
Search for used cars and extract listing details.

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
class CarsSearchRequest:
    make: str = "${cfg.make}"
    model: str = "${cfg.model}"
    zip_code: str = "${cfg.zip}"
    distance: int = ${cfg.distance}
    max_results: int = ${cfg.maxItems}


@dataclass(frozen=True)
class CarListing:
    title: str = ""
    price: str = ""
    mileage: str = ""
    dealer_name: str = ""
    location: str = ""


@dataclass(frozen=True)
class CarsSearchResult:
    listings: list = None  # list[CarListing]


def cars_search(page: Page, request: CarsSearchRequest) -> CarsSearchResult:
    make = request.make
    model = request.model
    zip_code = request.zip_code
    distance = request.distance
    max_results = request.max_results
    print(f"  Searching: {make} {model}, zip={zip_code}, {distance}mi, max={max_results}\\n")

    url = (
        f"https://www.cars.com/shopping/results/"
        f"?stock_type=used"
        f"&makes[]={make.lower()}"
        f"&models[]={make.lower()}-{model.lower()}"
        f"&zip={zip_code}"
        f"&maximum_distance={distance}"
    )
    print(f"Loading {url}...")
    checkpoint(f"Navigate to {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    print(f"  Loaded: {page.url}")

    body_text = page.evaluate("document.body ? document.body.innerText : ''") or ""

    results = []

    cards = page.locator(
        'div.vehicle-card, '
        '[data-test="vehicleCardLink"], '
        'div[class*="vehicle-card"]'
    )
    count = cards.count()
    print(f"  Found {count} vehicle cards via selectors")

    if count > 0:
        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                card_text = card.inner_text(timeout=3000).strip()
                lines = [l.strip() for l in card_text.split("\\n") if l.strip()]

                title = "N/A"
                price = "N/A"
                mileage = "N/A"
                dealer_name = "N/A"
                location = "N/A"

                for line in lines:
                    pm = re.search(r'\\$[\\d,]+', line)
                    if pm and price == "N/A":
                        price = pm.group(0)
                        continue
                    mm = re.search(r'([\\d,]+)\\s*mi\\.?', line, re.I)
                    if mm and mileage == "N/A":
                        mileage = mm.group(0)
                        continue
                    lm = re.search(r'[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*,\\s*[A-Z]{2}', line)
                    if lm and location == "N/A":
                        location = lm.group(0)
                        continue
                    tm = re.search(r'(20\\d{2}|19\\d{2})\\s+\\w+', line)
                    if tm and title == "N/A" and len(line) > 8:
                        title = line
                        continue
                    if (len(line) > 5 and dealer_name == "N/A"
                            and not re.match(r'^[\\$\\d]', line)
                            and title != "N/A" and price != "N/A"):
                        dealer_name = line

                if title != "N/A":
                    results.append(CarListing(
                        title=title,
                        price=price,
                        mileage=mileage,
                        dealer_name=dealer_name,
                        location=location,
                    ))
            except Exception:
                continue

    if not results:
        print("  Card selectors missed, trying text-based extraction...")
        text_lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            tm = re.search(r'(20\\d{2}|19\\d{2})\\s+\\w+', line)
            if tm and len(line) > 10:
                title = line
                price = "N/A"
                mileage = "N/A"
                dealer_name = "N/A"
                location = "N/A"

                for j in range(i + 1, min(len(text_lines), i + 10)):
                    nearby = text_lines[j]
                    pm = re.search(r'\\$[\\d,]+', nearby)
                    if pm and price == "N/A":
                        price = pm.group(0)
                    mmatch = re.search(r'([\\d,]+)\\s*mi\\.?', nearby, re.I)
                    if mmatch and mileage == "N/A":
                        mileage = mmatch.group(0)
                    lm = re.search(r'[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*,\\s*[A-Z]{2}', nearby)
                    if lm and location == "N/A":
                        location = lm.group(0)
                    if (len(nearby) > 5 and dealer_name == "N/A"
                            and not re.match(r'^[\\$\\d]', nearby)
                            and not re.search(r'\\d{4}\\s+\\w+', nearby)
                            and not re.search(r'mi\\.?', nearby, re.I)):
                        dealer_name = nearby

                if price != "N/A" or mileage != "N/A":
                    results.append(CarListing(
                        title=title,
                        price=price,
                        mileage=mileage,
                        dealer_name=dealer_name,
                        location=location,
                    ))
            i += 1

    print("=" * 60)
    print(f"Cars.com - Used {make} {model} near {zip_code}")
    print("=" * 60)
    for idx, c in enumerate(results, 1):
        print(f"\\n{idx}. {c.title}")
        print(f"   Price: {c.price}")
        print(f"   Mileage: {c.mileage}")
        print(f"   Dealer: {c.dealer_name}")
        print(f"   Location: {c.location}")

    print(f"\\nFound {len(results)} listings")

    return CarsSearchResult(listings=results)


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
        result = cars_search(page, CarsSearchRequest())
        print(f"\\nReturned {len(result.listings or [])} listings")
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
    const searchUrl = `https://www.cars.com/shopping/results/?stock_type=used&makes[]=${CFG.make.toLowerCase()}&models[]=${CFG.make.toLowerCase()}-${CFG.model.toLowerCase()}&zip=${CFG.zip}&maximum_distance=${CFG.distance}`;
    console.log("🌐 Navigating to Cars.com search...");
    recorder.record("navigate", { url: searchUrl });
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied")) {
      console.log("🚫 Bot detection triggered. Stopping.");
      process.exit(1);
    }

    console.log(`🎯 Extracting up to ${CFG.maxItems} listings...`);
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} used car listings from this Cars.com search results page. For each listing get: title (year/make/model), price, mileage, dealer name, and location.`,
      z.object({
        listings: z.array(z.object({
          title: z.string(),
          price: z.string(),
          mileage: z.string(),
          dealer_name: z.string(),
          location: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${data.listings.length} listings:`);
    data.listings.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.title}`);
      console.log(`     Price: ${c.price}  Mileage: ${c.mileage}  Dealer: ${c.dealer_name}  Location: ${c.location}`);
    });

    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "cars_search.py");
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
