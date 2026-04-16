const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Skillshare – Class Search
 *
 * Searches Skillshare for classes matching a keyword.
 * Extracts class title, teacher name, duration, and student count.
 */

const CFG = {
  url: "https://www.skillshare.com/en/search",
  query: "illustration",
  maxResults: 5,
  waits: { page: 2000, search: 6000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Playwright script (Python) — Skillshare Class Search
Search for classes by keyword.
Extract class title, teacher name, duration, and number of students.

URL pattern: https://www.skillshare.com/en/search?query={query}

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os
import sys
import shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


DURATION_RE = re.compile(r"^(\\d+h\\s*)?\\d+m$")
STUDENTS_RE = re.compile(r"^[\\d,.]+k?$", re.IGNORECASE)
LEVEL_KEYWORDS = {"Any level", "Beginner", "Intermediate", "Advanced"}


def run(
    playwright: Playwright,
    query: str = "${cfg.query}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("skillshare_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        search_url = f"https://www.skillshare.com/en/search?query={quote_plus(query)}"
        for attempt in range(3):
            try:
                if attempt > 0:
                    page = context.new_page()
                page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                break
            except Exception as nav_err:
                if "crashed" in str(nav_err).lower() and attempt < 2:
                    page.wait_for_timeout(2000)
                else:
                    raise
        page.wait_for_timeout(6000)

        body = page.locator("body").inner_text(timeout=10000)
        lines = [l.strip() for l in body.split("\\n") if l.strip()]

        start_idx = 0
        for i, l in enumerate(lines):
            if re.match(r"^\\(\\d[\\d,.]*\\s+Results?\\)$", l):
                start_idx = i + 1
                break

        end_idx = len(lines)
        for i in range(start_idx, len(lines)):
            if lines[i] in ("Learning Paths", "Digital Products", "Shop Digital Products"):
                end_idx = i
                break

        i = start_idx
        while i < end_idx and len(results) < max_results:
            if DURATION_RE.match(lines[i]):
                duration = lines[i]
                students = "N/A"
                if i - 1 >= start_idx and STUDENTS_RE.match(lines[i - 1]):
                    students = lines[i - 1]
                level_idx = i - 2
                title = "N/A"
                teacher = "N/A"
                j = level_idx - 1 if level_idx >= start_idx else i - 3
                while j >= start_idx:
                    line = lines[j]
                    if re.match(r"^\\+\\d+$", line):
                        j -= 1
                        continue
                    if len(line) <= 25 and not re.match(r"^\\d", line) and line not in LEVEL_KEYWORDS:
                        j -= 1
                        continue
                    break
                if j >= start_idx:
                    title = lines[j]
                    j -= 1
                while j >= start_idx:
                    line = lines[j]
                    if re.match(r"^\\([\\d,.k]+\\)$", line, re.IGNORECASE):
                        j -= 1
                        continue
                    if re.match(r"^\\d(\\.\\d)?$", line):
                        j -= 1
                        continue
                    if line == "New":
                        j -= 1
                        continue
                    break
                if j >= start_idx:
                    candidate = lines[j]
                    if not candidate.startswith("View all") and not candidate.startswith("Learn "):
                        teacher = candidate
                if title != "N/A":
                    results.append({
                        "title": title,
                        "teacher": teacher,
                        "duration": duration,
                        "students": students,
                    })
                i += 1
                continue
            i += 1

        print(f'\\nFound {len(results)} classes for "{query}":\\n')
        for idx, c in enumerate(results, 1):
            print(f"  {idx}. {c['title']}")
            print(f"     Teacher: {c['teacher']}")
            print(f"     Duration: {c['duration']}  Students: {c['students']}")
            print()

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\\nTotal classes found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Skillshare – Class Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(\`  🔍 Query: \${CFG.query}\`);
  console.log(\`  📊 Max results: \${CFG.maxResults}\\n\`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
      },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    const searchUrl = \`\${CFG.url}?query=\${encodeURIComponent(CFG.query)}\`;
    console.log(\`🌐 Loading \${searchUrl}...\`);
    recorder.goto(searchUrl);
    await page.goto(searchUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.search);
    console.log("✅ Loaded\\n");

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      \`Extract up to \${CFG.maxResults} class results. For each, get the class title, teacher name, duration, and number of students.\`,
      z.object({
        classes: z.array(z.object({
          title: z.string().describe("Class title"),
          teacher: z.string().describe("Teacher name"),
          duration: z.string().describe("Class duration, e.g. '1h 42m'"),
          students: z.string().describe("Number of students, e.g. '8.4k'"),
        })).describe(\`Up to \${CFG.maxResults} classes\`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract class listings",
      results: listings,
    });

    console.log(\`📋 Found \${listings.classes.length} classes:\`);
    listings.classes.forEach((c, i) => {
      console.log(\`   \${i + 1}. \${c.title}\`);
      console.log(\`      Teacher: \${c.teacher}  Duration: \${c.duration}  Students: \${c.students}\`);
    });

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "skillshare_search.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(\`\\n✅ Python: \${pyPath}\`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(\`📋 Actions: \${jsonPath}\`);

    return listings;
  } catch (err) {
    console.error("\\n❌ Error:", err.message);
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
