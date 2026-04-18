const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "Samsung Galaxy S24",
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
GSMArena – Phone Specs
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class PhoneRequest:
    query: str = "${cfg.query}"


@dataclass
class PhoneResult:
    name: str = ""
    display_size: str = ""
    processor: str = ""
    ram: str = ""
    battery: str = ""
    camera: str = ""
    price: str = ""


def gsmarena_search(page: Page, request: PhoneRequest) -> PhoneResult:
    """Search GSMArena and extract phone specs."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName={request.query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to GSMArena search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Click first search result")
    first_link = page.locator("#review-body .makers ul li a").first
    try:
        first_link.wait_for(state="visible", timeout=5000)
        first_link.click()
        page.wait_for_timeout(5000)
    except Exception:
        print("Could not find search result, trying body text...")

    checkpoint("Extract phone specs")
    body_text = page.evaluate("document.body.innerText") or ""

    name = ""
    try:
        h1 = page.locator("h1.specs-phone-name-title").first
        if h1.is_visible(timeout=2000):
            name = h1.inner_text().strip()
    except Exception:
        pass

    if not name:
        nm = re.search(r"(Samsung Galaxy S24[^\\n]*)", body_text)
        if nm:
            name = nm.group(1).strip()

    display_size = ""
    dm = re.search(r"(?:display|screen)[^\\n]*?(\\d+\\.?\\d*\\s*(?:inches|\\x22|\"))", body_text, re.IGNORECASE)
    if dm:
        display_size = dm.group(1)
    else:
        dm2 = re.search(r"(\\d+\\.?\\d*)\\s*(?:inches|\\x22)", body_text, re.IGNORECASE)
        if dm2:
            display_size = dm2.group(1) + " inches"

    processor = ""
    pm = re.search(r"(?:chipset|processor|cpu)[^\\n]*?([A-Za-z][^\\n]{5,60})", body_text, re.IGNORECASE)
    if pm:
        processor = pm.group(1).strip()

    ram = ""
    rm = re.search(r"(\\d+\\s*GB\\s*RAM)", body_text, re.IGNORECASE)
    if rm:
        ram = rm.group(1)

    battery = ""
    bm = re.search(r"(\\d[\\d,]*\\s*mAh)", body_text, re.IGNORECASE)
    if bm:
        battery = bm.group(1)

    camera = ""
    cm = re.search(r"(\\d+\\s*MP)", body_text, re.IGNORECASE)
    if cm:
        camera = cm.group(1)

    price = ""
    prm = re.search(r"(?:price|about|from)[^\\n]*?([$\u20ac\u00a3]\\s*[\\d,.]+|\\d+\\s*(?:USD|EUR))", body_text, re.IGNORECASE)
    if prm:
        price = prm.group(1)

    result = PhoneResult(
        name=name, display_size=display_size, processor=processor,
        ram=ram, battery=battery, camera=camera, price=price,
    )

    print("\\n" + "=" * 60)
    print(f"GSMArena: {result.name}")
    print("=" * 60)
    print(f"  Display:   {result.display_size}")
    print(f"  Processor: {result.processor}")
    print(f"  RAM:       {result.ram}")
    print(f"  Battery:   {result.battery}")
    print(f"  Camera:    {result.camera}")
    print(f"  Price:     {result.price}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("gsmarena_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = gsmarena_search(page, PhoneRequest())
            print(f"\\nReturned specs for {result.name}")
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
    const searchUrl = `https://www.gsmarena.com/results.php3?sQuickSearch=yes&sName=${CFG.query.replace(/ /g, '+')}`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to GSMArena search" });

    console.log("Clicking first result...");
    await stagehand.act("click the first phone result link");
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("act", { instruction: "Click first result" });

    const specs = await stagehand.extract(
      "extract the phone name, display size, processor/chipset, RAM, battery capacity, camera resolution, and price"
    );
    console.log("\n📊 Specs:", JSON.stringify(specs, null, 2));
    recorder.record("extract", { instruction: "Extract phone specs", results: specs });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "gsmarena_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
