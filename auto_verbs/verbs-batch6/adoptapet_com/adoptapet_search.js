const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Adopt-a-Pet – Adoptable Pet Search
 *
 * Searches adoptapet.com for adoptable dogs near a location and extracts
 * pet name, breed, age, gender, and shelter/organization name.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  petType: "dogs",
  location: "Portland, OR",
  maxResults: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Adopt-a-Pet – Adoptable Pet Search
Pet type: "${cfg.petType}", Location: "${cfg.location}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class PetSearchRequest:
    pet_type: str = "${cfg.petType}"
    location: str = "${cfg.location}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Pet:
    name: str = ""
    breed: str = ""
    age: str = ""
    gender: str = ""
    shelter: str = ""


@dataclass
class PetSearchResult:
    pets: list = field(default_factory=list)


def adoptapet_search(page: Page, request: PetSearchRequest) -> PetSearchResult:
    """Search Adopt-a-Pet for adoptable pets."""
    print(f"  Pet type: {request.pet_type}")
    print(f"  Location: {request.location}\\n")

    # ── Navigate ──────────────────────────────────────────────────────
    url = f"https://www.adoptapet.com/pet-search?pet_type={request.pet_type}&location={quote_plus(request.location)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Adopt-a-Pet search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Dismiss popups ────────────────────────────────────────────────
    for sel in [
        "button:has-text('Accept')",
        "button:has-text('Got it')",
        "button[aria-label='Close']",
        "#onetrust-accept-btn-handler",
    ]:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=2000):
                btn.click()
                page.wait_for_timeout(500)
        except Exception:
            pass

    # ── Extract pets ──────────────────────────────────────────────────
    checkpoint("Extract pet listings")
    pets = page.evaluate(r"""(maxResults) => {
        const results = [];
        // Pet cards
        const cards = document.querySelectorAll(
            '.pet-card, [data-testid="pet-card"], .search-result-card, article'
        );
        for (const card of cards) {
            if (results.length >= maxResults) break;
            const text = card.innerText.trim();
            if (!text || text.length < 5) continue;

            const nameEl = card.querySelector('h2, h3, .pet-name, [data-testid="pet-name"]');
            const name = nameEl ? nameEl.innerText.trim() : '';

            // Look for breed, age, gender in the card text
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
            let breed = '', age = '', gender = '', shelter = '';

            for (const line of lines) {
                if (/puppy|kitten|adult|senior|young|baby/i.test(line) && !age) age = line;
                else if (/male|female/i.test(line) && !gender) gender = line;
                else if (/shelter|rescue|humane|spca|foster/i.test(line) && !shelter) shelter = line;
                else if (!breed && line !== name && line.length > 2 && line.length < 80) breed = line;
            }

            if (name) {
                results.push({ name, breed, age, gender, shelter });
            }
        }

        // Fallback: links with pet info
        if (results.length === 0) {
            const links = document.querySelectorAll('a[href*="/pet/"], a[href*="/dog/"], a[href*="/cat/"]');
            for (const link of links) {
                if (results.length >= maxResults) break;
                const text = link.innerText.trim();
                if (text && text.length > 2 && text.length < 100) {
                    results.push({ name: text, breed: '', age: '', gender: '', shelter: '' });
                }
            }
        }
        return results;
    }""", request.max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Adopt-a-Pet: {request.pet_type} near {request.location}")
    print("=" * 60)
    for idx, p in enumerate(pets, 1):
        print(f"\\n  {idx}. {p['name']}")
        print(f"     Breed: {p['breed']}")
        print(f"     Age: {p['age']}")
        print(f"     Gender: {p['gender']}")
        print(f"     Shelter: {p['shelter']}")

    result_pets = [Pet(**p) for p in pets]
    print(f"\\nFound {len(result_pets)} pets")
    return PetSearchResult(pets=result_pets)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("adoptapet_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = adoptapet_search(page, PetSearchRequest())
            print(f"\\nReturned {len(result.pets)} pets")
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
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const searchUrl = `https://www.adoptapet.com/pet-search?pet_type=${CFG.petType}&location=${encodeURIComponent(CFG.location)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search Adopt-a-Pet" });

    const pets = await page.evaluate((maxResults) => {
      const results = [];
      const cards = document.querySelectorAll(
        '.pet-card, [data-testid="pet-card"], .search-result-card, article'
      );
      for (const card of cards) {
        if (results.length >= maxResults) break;
        const text = card.innerText.trim();
        if (!text || text.length < 5) continue;
        const nameEl = card.querySelector("h2, h3, .pet-name");
        const name = nameEl ? nameEl.innerText.trim() : "";
        const lines = text.split("\n").map(l => l.trim()).filter(l => l);
        let breed = "", age = "", gender = "", shelter = "";
        for (const line of lines) {
          if (/puppy|kitten|adult|senior|young|baby/i.test(line) && !age) age = line;
          else if (/male|female/i.test(line) && !gender) gender = line;
          else if (/shelter|rescue|humane|spca|foster/i.test(line) && !shelter) shelter = line;
          else if (!breed && line !== name && line.length > 2 && line.length < 80) breed = line;
        }
        if (name) results.push({ name, breed, age, gender, shelter });
      }
      if (results.length === 0) {
        const links = document.querySelectorAll('a[href*="/pet/"], a[href*="/dog/"]');
        for (const link of links) {
          if (results.length >= maxResults) break;
          const text = link.innerText.trim();
          if (text && text.length > 2 && text.length < 100)
            results.push({ name: text, breed: "", age: "", gender: "", shelter: "" });
        }
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract pet listings",
      description: `Extracted ${pets.length} pets`,
      results: pets,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Adopt-a-Pet: ${CFG.petType} near ${CFG.location}`);
    console.log("=".repeat(60));
    pets.forEach((p, i) => {
      console.log(`\n  ${i + 1}. ${p.name}`);
      console.log(`     Breed: ${p.breed}`);
      console.log(`     Age: ${p.age}`);
      console.log(`     Gender: ${p.gender}`);
      console.log(`     Shelter: ${p.shelter}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "adoptapet_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
