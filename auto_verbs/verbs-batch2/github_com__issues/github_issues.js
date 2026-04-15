const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG = {
  url: "https://github.com",
  repo: "facebook/react",
  maxResults: 5,
  waits: { page: 3000, nav: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
GitHub – Repository Issues
Repo: ${cfg.repo}

Generated on: ${ts}
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    repo: str = "${cfg.repo}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Repo: {repo}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("github_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        print(f"Loading GitHub issues for {repo}...")
        page.goto(f"${cfg.url}/{repo}/issues")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        print(f"STEP 1: Extract up to {max_results} open issues...")
        issue_rows = page.locator(
            'div[id^="issue_"], '
            '[data-testid="issue-row"], '
            'div[class*="js-issue-row"]'
        )
        count = issue_rows.count()
        print(f"  Found {count} issue rows")

        for i in range(min(count, max_results)):
            row = issue_rows.nth(i)
            try:
                title = "N/A"
                labels = "N/A"
                created = "N/A"

                try:
                    title_el = row.locator('a[data-hovercard-type="issue"], a[id^="issue_"]').first
                    title = title_el.inner_text(timeout=2000).strip()
                except Exception:
                    try:
                        title_el = row.locator('a[class*="title"], h3, h4').first
                        title = title_el.inner_text(timeout=2000).strip()
                    except Exception:
                        pass

                try:
                    label_els = row.locator('a[class*="label"], span[class*="label"]')
                    lbl_count = label_els.count()
                    if lbl_count > 0:
                        labels = ", ".join([label_els.nth(j).inner_text(timeout=1000).strip() for j in range(lbl_count)])
                except Exception:
                    pass

                try:
                    time_el = row.locator('relative-time, time').first
                    created = time_el.get_attribute("datetime") or time_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                if title != "N/A":
                    results.append({"title": title, "labels": labels, "created": created})
                    print(f"  {len(results)}. {title} | Labels: {labels} | Created: {created}")

            except Exception as e:
                print(f"  Error on row {i}: {e}")
                continue

        print(f"\\nFound {len(results)} open issues for '{repo}':")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['title']}")
            print(f"     Labels: {r['labels']}  Created: {r['created']}")

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
        print(f"\\nTotal issues found: {len(items)}")
`;
}

async function main() {
  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;
  try {
    stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: { userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"), headless: false, viewport: { width: 1920, height: 1080 }, args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized", "--window-size=1920,1080"] },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];
    await page.goto(`${CFG.url}/${CFG.repo}/issues`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      `Extract up to ${CFG.maxResults} open issues. For each get the title, labels, and creation date.`,
      z.object({ issues: z.array(z.object({ title: z.string(), labels: z.string(), created: z.string() })) })
    );
    recorder.record("extract", { instruction: "Extract issues", results: listings });
    fs.writeFileSync(path.join(__dirname, "github_issues.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return listings;
  } catch (err) {
    console.error("❌", err.message);
    if (recorder?.actions.length > 0) fs.writeFileSync(path.join(__dirname, "github_issues.py"), genPython(CFG, recorder), "utf-8");
    throw err;
  } finally { if (stagehand) await stagehand.close(); }
}

if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
