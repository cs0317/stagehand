/**
 * Canva – Template Search
 *
 * Prompt:
 *   Search for design templates matching "business presentation".
 *   Extract up to 5 templates with template name, category,
 *   dimensions or format, and whether it is free or pro.
 *
 * Strategy:
 *   Navigate to canva.com, search for the query, then extract template cards.
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
  query: "business presentation",
  maxItems: 5,
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Canva – Template Search
Search for design templates and extract template details.

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
class CanvaTemplateSearchRequest:
    search_query: str = "${cfg.query}"
    max_results: int = ${cfg.maxItems}


@dataclass(frozen=True)
class CanvaTemplate:
    template_name: str = ""
    category: str = ""
    dimensions: str = ""
    is_free: str = ""


@dataclass(frozen=True)
class CanvaTemplateSearchResult:
    templates: list = None  # list[CanvaTemplate]


def canva_template_search(page: Page, request: CanvaTemplateSearchRequest) -> CanvaTemplateSearchResult:
    search_query = request.search_query
    max_results = request.max_results
    print(f"  Search query: {search_query}")
    print(f"  Max templates to extract: {max_results}\\n")

    url = "https://www.canva.com"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    print(f"  Loaded: {page.url}")

    search_input = page.locator(
        'input[type="search"], '
        'input[placeholder*="Search"], '
        'input[aria-label*="Search"], '
        'input[data-testid*="search"]'
    )
    if search_input.count() > 0:
        checkpoint(f"Type '{search_query}' into search box")
        search_input.first.click(timeout=5000)
        search_input.first.fill(search_query)
        page.keyboard.press("Enter")
        page.wait_for_timeout(5000)
        print(f"  Searched for: {search_query}")
    else:
        search_url = f"https://www.canva.com/search/templates?q={search_query.replace(' ', '%20')}"
        print(f"  Search input not found, navigating to {search_url}")
        checkpoint(f"Navigate to search URL for '{search_query}'")
        page.goto(search_url, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)

    print(f"  Current URL: {page.url}")

    results = []

    cards = page.locator(
        '[class*="TemplateCard"], '
        '[data-testid*="template"], '
        '[class*="template-card"], '
        '[class*="DesignCard"], '
        'a[href*="/templates/"]'
    )
    count = cards.count()
    print(f"  Found {count} template cards via selectors")

    if count > 0:
        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                card_text = card.inner_text(timeout=3000).strip()
                lines = [l.strip() for l in card_text.split("\\n") if l.strip()]

                template_name = "N/A"
                category = "N/A"
                dimensions = "N/A"
                is_free = "N/A"

                for line in lines:
                    low = line.lower()
                    if re.search(r'\\bpro\\b', low):
                        is_free = "Pro"
                        continue
                    if re.search(r'\\bfree\\b', low):
                        is_free = "Free"
                        continue
                    dm = re.search(r'\\d+\\s*[\\xd7x]\\s*\\d+', line)
                    if dm:
                        dimensions = line
                        continue
                    ratio = re.search(r'\\d+:\\d+', line)
                    if ratio:
                        dimensions = line
                        continue
                    if any(kw in low for kw in [
                        'presentation', 'infographic', 'poster', 'flyer',
                        'social media', 'instagram', 'facebook', 'logo',
                        'resume', 'invitation', 'brochure', 'banner',
                        'video', 'whiteboard', 'doc', 'card',
                    ]):
                        if category == "N/A":
                            category = line
                        continue
                    if len(line) > 3 and not re.match(r'^[\\d%$]', line):
                        if template_name == "N/A" or len(line) > len(template_name):
                            template_name = line

                if template_name != "N/A":
                    results.append(CanvaTemplate(
                        template_name=template_name,
                        category=category,
                        dimensions=dimensions,
                        is_free=is_free,
                    ))
            except Exception:
                continue

    if not results:
        print("  Card selectors missed, trying text-based extraction...")
        body_text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            low = line.lower()
            if len(line) > 15 and not re.match(r'^[\\d%$]', line) and "canva" not in low:
                template_name = line
                category = "N/A"
                dimensions = "N/A"
                is_free = "N/A"

                for j in range(max(0, i - 2), min(len(text_lines), i + 5)):
                    nearby = text_lines[j]
                    nearby_low = nearby.lower()
                    if re.search(r'\\bpro\\b', nearby_low) and is_free == "N/A":
                        is_free = "Pro"
                    elif re.search(r'\\bfree\\b', nearby_low) and is_free == "N/A":
                        is_free = "Free"
                    dm = re.search(r'\\d+\\s*[\\xd7x]\\s*\\d+', nearby)
                    if dm and dimensions == "N/A":
                        dimensions = nearby
                    ratio = re.search(r'\\d+:\\d+', nearby)
                    if ratio and dimensions == "N/A":
                        dimensions = nearby

                results.append(CanvaTemplate(
                    template_name=template_name,
                    category=category,
                    dimensions=dimensions,
                    is_free=is_free,
                ))
            i += 1

    print("=" * 60)
    print(f"Canva - Template Search: '{search_query}'")
    print("=" * 60)
    for idx, t in enumerate(results, 1):
        print(f"\\n{idx}. {t.template_name}")
        print(f"   Category: {t.category}")
        print(f"   Dimensions: {t.dimensions}")
        print(f"   Access: {t.is_free}")

    print(f"\\nFound {len(results)} templates")

    return CanvaTemplateSearchResult(templates=results)


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
        result = canva_template_search(page, CanvaTemplateSearchRequest())
        print(f"\\nReturned {len(result.templates or [])} templates")
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
    console.log("🌐 Navigating to Canva...");
    recorder.record("navigate", { url: "https://www.canva.com" });
    await page.goto("https://www.canva.com", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied")) {
      console.log("🚫 Bot detection triggered. Stopping.");
      process.exit(1);
    }

    console.log(`🔍 Searching for "${CFG.query}"...`);
    await stagehand.act(`Type "${CFG.query}" into the search box and press Enter`);
    await page.waitForTimeout(5000);

    console.log(`🎯 Extracting up to ${CFG.maxItems} templates...`);
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} design templates from this search results page. For each template get: template name, category, dimensions or format, and whether it is free or pro.`,
      z.object({
        templates: z.array(z.object({
          template_name: z.string(),
          category: z.string(),
          dimensions: z.string(),
          is_free: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${data.templates.length} templates:`);
    data.templates.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.template_name}`);
      console.log(`     Category: ${t.category}  Dimensions: ${t.dimensions}  Access: ${t.is_free}`);
    });

    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "canva_template_search.py");
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
