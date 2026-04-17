/**
 * Congress.gov – Legislation Search
 *
 * Prompt:
 *   Search for legislation matching "infrastructure bill".
 *   Extract up to 5 bills with bill number, title, sponsor,
 *   date introduced, and current status.
 *
 * Strategy:
 *   Direct URL: congress.gov/search?q=...
 *   Then extract bill list items.
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
  query: "infrastructure bill",
  maxItems: 5,
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Congress.gov – Legislation Search
Search for legislation and extract bill details.

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
class CongressLegislationRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxItems}


@dataclass(frozen=True)
class CongressBill:
    bill_number: str = ""
    title: str = ""
    sponsor: str = ""
    date_introduced: str = ""
    status: str = ""


@dataclass(frozen=True)
class CongressLegislationResult:
    bills: list = None  # list[CongressBill]


def congress_legislation(page: Page, request: CongressLegislationRequest) -> CongressLegislationResult:
    query = request.query
    max_results = request.max_results
    print(f"  Search query: {query}")
    print(f"  Max results to extract: {max_results}\\n")

    url = f"https://www.congress.gov/search?q=%7B%22source%22%3A%22legislation%22%2C%22search%22%3A%22{query.replace(' ', '+')}%22%7D"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to Congress.gov legislation search for '{query}'")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    print(f"  Loaded: {page.url}")

    results = []

    items = page.locator('ol.basic-search-results-lists li.expanded')
    count = items.count()
    print(f"  Found {count} search result items via selector")

    if count > 0:
        for i in range(min(count, max_results)):
            item = items.nth(i)
            try:
                item_text = item.inner_text(timeout=5000).strip()
                lines = [l.strip() for l in item_text.split("\\n") if l.strip()]

                bill_number = "N/A"
                title = "N/A"
                sponsor = "N/A"
                date_introduced = "N/A"
                status = "N/A"

                for line in lines:
                    bm = re.match(r'^((?:H\\.R\\.|S\\.|H\\.Res\\.|S\\.Res\\.|H\\.J\\.Res\\.|S\\.J\\.Res\\.|H\\.Con\\.Res\\.|S\\.Con\\.Res\\.)\\s*\\d+)', line)
                    if bm and bill_number == "N/A":
                        bill_number = bm.group(1).strip()
                        rest = line[bm.end():].strip()
                        if rest.startswith("\\u2014") or rest.startswith("-"):
                            rest = rest.lstrip("\\u2014- ").strip()
                        if rest and len(rest) > 5:
                            title = rest
                        continue

                    sm = re.search(r'Sponsor:\\s*(.+)', line, re.I)
                    if sm:
                        sponsor = sm.group(1).strip()
                        continue

                    dm = re.search(r'(?:Introduced|Date)\\s*[:\\-]?\\s*(\\d{1,2}/\\d{1,2}/\\d{2,4})', line, re.I)
                    if dm:
                        date_introduced = dm.group(1).strip()
                        continue

                    lm = re.search(r'(?:Latest Action|Status|Last Action)\\s*[:\\-]?\\s*(.+)', line, re.I)
                    if lm:
                        status = lm.group(1).strip()
                        continue

                    if title == "N/A" and len(line) > 20 and not re.match(r'^[\\d/]', line):
                        title = line

                if bill_number != "N/A" or title != "N/A":
                    results.append(CongressBill(
                        bill_number=bill_number,
                        title=title,
                        sponsor=sponsor,
                        date_introduced=date_introduced,
                        status=status,
                    ))
            except Exception:
                continue

    if not results:
        print("  Structured selectors missed, trying text-based extraction...")
        body_text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            bm = re.match(r'^((?:H\\.R\\.|S\\.|H\\.Res\\.|S\\.Res\\.|H\\.J\\.Res\\.|S\\.J\\.Res\\.)\\s*\\d+)', line)
            if bm:
                bill_number = bm.group(1).strip()
                title = "N/A"
                sponsor = "N/A"
                date_introduced = "N/A"
                status = "N/A"

                for j in range(i, min(len(text_lines), i + 10)):
                    nearby = text_lines[j]
                    if j == i:
                        rest = nearby[bm.end():].strip()
                        if rest.startswith("\\u2014") or rest.startswith("-"):
                            rest = rest.lstrip("\\u2014- ").strip()
                        if rest and len(rest) > 5:
                            title = rest
                        continue
                    sm = re.search(r'Sponsor:\\s*(.+)', nearby, re.I)
                    if sm:
                        sponsor = sm.group(1).strip()
                        continue
                    dm2 = re.search(r'(\\d{1,2}/\\d{1,2}/\\d{2,4})', nearby)
                    if dm2 and date_introduced == "N/A":
                        date_introduced = dm2.group(1).strip()
                        continue
                    lm = re.search(r'(?:Latest Action|Status)\\s*[:\\-]?\\s*(.+)', nearby, re.I)
                    if lm:
                        status = lm.group(1).strip()
                        continue
                    if title == "N/A" and len(nearby) > 20 and not re.match(r'^[\\d/$]', nearby):
                        title = nearby

                if bill_number != "N/A":
                    results.append(CongressBill(
                        bill_number=bill_number,
                        title=title,
                        sponsor=sponsor,
                        date_introduced=date_introduced,
                        status=status,
                    ))
            i += 1

    print("=" * 60)
    print(f"Congress.gov - Legislation Search: '{query}'")
    print("=" * 60)
    for idx, b in enumerate(results, 1):
        print(f"\\n{idx}. {b.bill_number}")
        print(f"   Title: {b.title}")
        print(f"   Sponsor: {b.sponsor}")
        print(f"   Introduced: {b.date_introduced}")
        print(f"   Status: {b.status}")

    print(f"\\nFound {len(results)} bills")

    return CongressLegislationResult(bills=results)


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
        result = congress_legislation(page, CongressLegislationRequest())
        print(f"\\nReturned {len(result.bills or [])} bills")
        context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

/* ── main ────────────────────────────────────────────────── */
(async () => {
  const llmClient = setupLLMClient("copilot");

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
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
    const searchUrl = `https://www.congress.gov/search?q=%7B%22source%22%3A%22legislation%22%2C%22search%22%3A%22${encodeURIComponent(CFG.query)}%22%7D`;
    console.log("🌐 Navigating to Congress.gov legislation search...");
    recorder.record("navigate", { url: searchUrl });
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied")) {
      console.log("🚫 Bot detection triggered. Stopping.");
      process.exit(1);
    }

    console.log(`🎯 Extracting up to ${CFG.maxItems} bills...`);
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} legislation results from this Congress.gov search page. For each bill get: bill number, title, sponsor, date introduced, and current status.`,
      z.object({
        bills: z.array(z.object({
          bill_number: z.string(),
          title: z.string(),
          sponsor: z.string(),
          date_introduced: z.string(),
          status: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${data.bills.length} bills:`);
    data.bills.forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.bill_number} — ${b.title}`);
      console.log(`     Sponsor: ${b.sponsor}  Introduced: ${b.date_introduced}  Status: ${b.status}`);
    });

    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "congress_legislation.py");
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
