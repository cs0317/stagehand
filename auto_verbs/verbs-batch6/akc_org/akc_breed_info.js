const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * AKC – Dog Breed Info
 *
 * Searches akc.org for a dog breed and extracts breed details.
 */

const CFG = {
  breed: "Golden Retriever",
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
AKC – Dog Breed Info
Breed: "${cfg.breed}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class BreedRequest:
    breed: str = "${cfg.breed}"


@dataclass
class BreedResult:
    breed_name: str = ""
    breed_group: str = ""
    size: str = ""
    life_expectancy: str = ""
    temperament: str = ""
    popularity_rank: str = ""


def akc_breed_info(page: Page, request: BreedRequest) -> BreedResult:
    """Look up dog breed info on AKC."""
    print(f"  Breed: {request.breed}\\n")

    slug = request.breed.lower().replace(" ", "-")
    url = f"https://www.akc.org/dog-breeds/{slug}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to AKC breed page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # Extract breed details
    checkpoint("Extract breed details")
    body_text = page.evaluate("document.body.innerText") or ""

    breed_name = request.breed
    breed_group = ""
    size = ""
    life_exp = ""
    temperament = ""
    popularity = ""

    # Try to find breed group
    gm = re.search(r"(?:Breed Group|Group)[:\\s]*([A-Za-z\\s]+?)(?:\\n|$)", body_text)
    if gm:
        breed_group = gm.group(1).strip()

    # Life expectancy
    lem = re.search(r"(?:Life Expectancy|Lifespan)[:\\s]*(\\d+[\\s\\-]+\\d+\\s*years?)", body_text, re.IGNORECASE)
    if lem:
        life_exp = lem.group(1).strip()

    # Height/size
    sm = re.search(r"(?:Height)[:\\s]*(\\d+[\\s\\-]+[\\d.]+\\s*inches?)", body_text, re.IGNORECASE)
    if sm:
        size = sm.group(1).strip()

    # Temperament
    tm = re.search(r"(?:Temperament)[:\\s]*([^\\n]+)", body_text, re.IGNORECASE)
    if tm:
        temperament = tm.group(1).strip()

    # Popularity
    pm = re.search(r"(?:Popularity|AKC Rank)[:\\s]*(#?\\d+)", body_text, re.IGNORECASE)
    if pm:
        popularity = pm.group(1).strip()

    result = BreedResult(
        breed_name=breed_name,
        breed_group=breed_group,
        size=size,
        life_expectancy=life_exp,
        temperament=temperament,
        popularity_rank=popularity,
    )

    print("\\n" + "=" * 60)
    print(f"AKC: {result.breed_name}")
    print("=" * 60)
    print(f"  Breed Group:      {result.breed_group}")
    print(f"  Size:             {result.size}")
    print(f"  Life Expectancy:  {result.life_expectancy}")
    print(f"  Temperament:      {result.temperament}")
    print(f"  Popularity Rank:  {result.popularity_rank}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("akc_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = akc_breed_info(page, BreedRequest())
            print(f"\\nDone. Breed: {result.breed_name}")
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
    const slug = CFG.breed.toLowerCase().replace(/ /g, "-");
    const url = `https://www.akc.org/dog-breeds/${slug}/`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to AKC breed page" });

    const breedData = await stagehand.extract(
      "extract the breed name, breed group, size/height, life expectancy, temperament traits, and AKC popularity ranking"
    );
    console.log("\n📊 Breed Data:", JSON.stringify(breedData, null, 2));
    recorder.record("extract", {
      instruction: "Extract breed details",
      description: "Extracted breed information",
      results: breedData,
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "akc_breed_info.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
