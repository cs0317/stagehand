const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "civil war photographs",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Library of Congress – Digital Collections Search
Query: "${cfg.query}"

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
class LocRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class LocItem:
    title: str = ""
    creator: str = ""
    date: str = ""
    collection: str = ""
    url: str = ""


@dataclass
class LocResult:
    items: List[LocItem] = field(default_factory=list)


def loc_search(page: Page, request: LocRequest) -> LocResult:
    """Search Library of Congress digital collections."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.loc.gov/search/?q={request.query.replace(' ', '+')}&fa=original-format:photo,+print,+drawing"
    print(f"Loading {url}...")
    checkpoint("Navigate to LOC search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract search results")
    items = []

    cards = page.locator("li.item, div.result, article.item").all()
    if not cards:
        cards = page.locator("ul.results li, div[class*='result']").all()

    for card in cards[:request.max_results]:
        try:
            text = card.inner_text().strip()
            lines = [l.strip() for l in text.split("\\n") if l.strip()]
            if not lines:
                continue
            title = lines[0][:120]
            creator = ""
            date = ""
            collection = ""
            item_url = ""

            for line in lines[1:]:
                dm = re.search(r"(\\d{4})", line)
                if dm and not date:
                    date = dm.group(1)
                if "collection" in line.lower() or "division" in line.lower():
                    collection = line[:80]
                if "by " in line.lower() or "creator" in line.lower():
                    creator = line.replace("by ", "").replace("Creator: ", "").strip()[:60]

            try:
                link = card.locator("a").first
                href = link.get_attribute("href") or ""
                if href:
                    item_url = href if href.startswith("http") else "https://www.loc.gov" + href
            except Exception:
                pass

            if title:
                items.append(LocItem(title=title, creator=creator, date=date, collection=collection, url=item_url))
        except Exception:
            pass

    if not items:
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip() and len(l.strip()) > 10]
        for line in lines:
            if any(kw in line.lower() for kw in ["civil war", "photograph", "collection"]):
                items.append(LocItem(title=line[:120]))
                if len(items) >= request.max_results:
                    break

    result = LocResult(items=items[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"Library of Congress: {request.query}")
    print("=" * 60)
    for i, item in enumerate(result.items, 1):
        print(f"  {i}. {item.title}")
        if item.creator:
            print(f"     Creator:    {item.creator}")
        if item.date:
            print(f"     Date:       {item.date}")
        if item.collection:
            print(f"     Collection: {item.collection}")
        if item.url:
            print(f"     URL:        {item.url}")
    print(f"\\nTotal: {len(result.items)} items")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("loc_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = loc_search(page, LocRequest())
            print(f"\\nReturned {len(result.items)} items")
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
    const searchUrl = `https://www.loc.gov/search/?q=${encodeURIComponent(CFG.query)}&fa=original-format:photo,+print,+drawing`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to LOC search" });

    const items = await stagehand.extract(
      `extract up to ${CFG.maxResults} results with item title, creator, date, collection name, and item URL`
    );
    console.log("\n📊 Items:", JSON.stringify(items, null, 2));
    recorder.record("extract", { instruction: "Extract LOC items", results: items });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "loc_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
