const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  service: "plumbing",
  location: "Denver, CO",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
HomeAdvisor – Service Professional Search
Service: "${cfg.service}"
Location: "${cfg.location}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ServiceRequest:
    service: str = "${cfg.service}"
    location: str = "${cfg.location}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Professional:
    name: str = ""
    rating: str = ""
    reviews: str = ""
    years_in_business: str = ""
    phone: str = ""


@dataclass
class ServiceResult:
    professionals: List[Professional] = field(default_factory=list)


def homeadvisor_search(page: Page, request: ServiceRequest) -> ServiceResult:
    """Search HomeAdvisor for service professionals."""
    print(f"  Service: {request.service}")
    print(f"  Location: {request.location}\\n")

    url = f"https://www.homeadvisor.com/c.{request.service.replace(' ', '-')}.{request.location.split(',')[0].strip().replace(' ', '-')}.{request.location.split(',')[1].strip()}.html"
    print(f"Loading {url}...")
    checkpoint("Navigate to HomeAdvisor")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract professional listings")
    professionals = []
    body_text = page.evaluate("document.body.innerText") or ""

    cards = page.locator("[class*='pro-card'], [class*='ProCard'], [data-testid*='pro']").all()
    for card in cards[:request.max_results]:
        try:
            text = card.inner_text().strip()
            lines = [l.strip() for l in text.split("\\n") if l.strip()]
            name = lines[0] if lines else ""
            rating = ""
            reviews = ""
            years = ""
            phone = ""
            for line in lines:
                rm = re.search(r"(\\d+\\.?\\d*)\\s*(?:star|rating|/5)", line, re.IGNORECASE)
                if rm:
                    rating = rm.group(1)
                revm = re.search(r"(\\d+)\\s*(?:review|rating)", line, re.IGNORECASE)
                if revm:
                    reviews = revm.group(1)
                ym = re.search(r"(\\d+)\\s*(?:year|yr)", line, re.IGNORECASE)
                if ym:
                    years = ym.group(1) + " years"
                pm = re.search(r"(\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4})", line)
                if pm:
                    phone = pm.group(1)
            if name:
                professionals.append(Professional(
                    name=name[:80], rating=rating, reviews=reviews,
                    years_in_business=years, phone=phone,
                ))
        except Exception:
            pass

    if not professionals:
        lines = [l.strip() for l in body_text.split("\\n") if l.strip()]
        i = 0
        while i < len(lines) and len(professionals) < request.max_results:
            line = lines[i]
            if re.search(r"plumb|service|contractor", line, re.IGNORECASE) and len(line) > 5:
                professionals.append(Professional(name=line[:80]))
            i += 1

    result = ServiceResult(professionals=professionals[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"HomeAdvisor: {request.service} in {request.location}")
    print("=" * 60)
    for i, p in enumerate(result.professionals, 1):
        print(f"  {i}. {p.name}")
        if p.rating:
            print(f"     Rating: {p.rating}")
        if p.reviews:
            print(f"     Reviews: {p.reviews}")
        if p.years_in_business:
            print(f"     Experience: {p.years_in_business}")
        if p.phone:
            print(f"     Phone: {p.phone}")
    print(f"\\nTotal: {len(result.professionals)} professionals")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("homeadvisor_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = homeadvisor_search(page, ServiceRequest())
            print(f"\\nReturned {len(result.professionals)} professionals")
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
    const searchUrl = `https://www.homeadvisor.com/c.${CFG.service.replace(/ /g, '-')}.${CFG.location.split(',')[0].trim().replace(/ /g, '-')}.${CFG.location.split(',')[1].trim()}.html`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to HomeAdvisor" });

    const pros = await stagehand.extract(
      `extract up to ${CFG.maxResults} service professionals with business name, rating, number of reviews, years in business, and phone number`
    );
    console.log("\n📊 Pros:", JSON.stringify(pros, null, 2));
    recorder.record("extract", { instruction: "Extract professionals", results: pros });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "homeadvisor_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
