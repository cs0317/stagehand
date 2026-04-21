const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Overleaf – Download Project (as source zip)
 *
 * Searches for a project on the dashboard, selects it, clicks download.
 */

const CFG = {
  url: "https://www.overleaf.com/project",
  searchQuery: "My Paper 1",
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Overleaf – Download Project

Searches for an Overleaf project by name on the dashboard,
selects it, and downloads it as a source zip file.

Generated on: ${ts}
Recorded ${n} browser interactions

Uses the user's Chrome profile for persistent login state.
"""

import os
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint
from overleaf_helpers import ensure_test_project_exists


@dataclass(frozen=True)
class OverleafDownloadProjectRequest:
    search_query: str
    download_dir: str


@dataclass(frozen=True)
class OverleafDownloadProjectResult:
    success: bool
    file_path: str
    error: str


# Searches for a project by name on the Overleaf dashboard,
# selects it, and downloads it as a source zip.
def overleaf_download_project(
    page: Page,
    request: OverleafDownloadProjectRequest,
) -> OverleafDownloadProjectResult:

    try:
        # ── STEP 1: Navigate to project dashboard ────────────────────
        print("STEP 1: Loading Overleaf project dashboard...")
        checkpoint("Navigate to project dashboard")
        page.goto(
            "https://www.overleaf.com/project",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Search for project ───────────────────────────────
        print(f'STEP 2: Searching for "{request.search_query}"...')
        search_input = page.locator(
            'input[placeholder="Search in all projects\\u2026"]'
        ).first
        checkpoint("Click search input")
        search_input.click()
        page.wait_for_timeout(500)
        search_input.press("Control+a")
        checkpoint(f"Type search query: {request.search_query}")
        search_input.type(request.search_query, delay=50)
        page.wait_for_timeout(2000)
        print("  Search entered.")

        # ── STEP 3: Select the first matching project ────────────────
        print("STEP 3: Selecting first matching project...")
        first_checkbox = page.locator('td input[type="checkbox"]').first
        if first_checkbox.count() == 0:
            return OverleafDownloadProjectResult(
                success=False, file_path="",
                error=f'No projects found matching "{request.search_query}"',
            )
        checkpoint("Click project checkbox")
        first_checkbox.click()
        page.wait_for_timeout(1000)
        print("  Project selected.")

        # ── STEP 4: Click the download button ────────────────────────
        print("STEP 4: Clicking download button...")
        download_btn = page.locator('button:has-text("download")').first
        checkpoint("Click download button")
        with page.expect_download() as download_info:
            download_btn.click()
        download = download_info.value
        file_path = os.path.join(request.download_dir, download.suggested_filename)
        download.save_as(file_path)
        page.wait_for_timeout(2000)
        print(f"  Downloaded to: {file_path}")

        print(f"\\nSuccess! Downloaded: {file_path}")
        return OverleafDownloadProjectResult(
            success=True, file_path=file_path, error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return OverleafDownloadProjectResult(
            success=False, file_path="", error=str(e),
        )


def test_overleaf_download_project() -> None:
    print("=" * 60)
    print("  Overleaf – Download Project")
    print("=" * 60)

    user_data_dir = os.path.join(
        os.environ["USERPROFILE"],
        "AppData", "Local", "Google", "Chrome", "User Data", "Default",
    )
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            user_data_dir,
            channel="chrome",
            headless=False,
            viewport=None,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--disable-extensions",
                "--start-maximized",
            ],
        )
        page = context.pages[0] if context.pages else context.new_page()
        try:
            ensure_test_project_exists(page, "${cfg.searchQuery}")
            request = OverleafDownloadProjectRequest(
                search_query="${cfg.searchQuery}",
                download_dir=os.path.join(os.environ["USERPROFILE"], "Downloads"),
            )
            result = overleaf_download_project(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.file_path}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_overleaf_download_project)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Overleaf – Download Project");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    console.log("🎭 Initializing Stagehand...");
    stagehand = new Stagehand({
      env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: {
        userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"),
        headless: false, viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized", "--window-size=1920,1080"],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    console.log("🌐 STEP 1: Loading project dashboard...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);
    console.log(`  ✅ Loaded: ${page.url()}\n`);

    console.log(`🔍 STEP 2: Searching for "${CFG.searchQuery}"...`);
    await page.evaluate((q) => {
      const input = document.querySelector('input[placeholder="Search in all projects…"]');
      input.focus(); input.value = '';
      const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSet.call(input, q);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, CFG.searchQuery);
    recorder.fill('input[placeholder="Search in all projects…"]', CFG.searchQuery, 'Search');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Search entered\n");

    console.log("☑️  STEP 3: Selecting first project...");
    await page.waitForSelector('td input[type="checkbox"]', { state: "visible", timeout: 5000 });
    await page.evaluate(() => { document.querySelector('td input[type="checkbox"]')?.click(); });
    recorder.click('td input[type="checkbox"]', 'Click checkbox');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Selected\n");

    console.log("📥 STEP 4: Clicking download button...");
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) { if (btn.textContent.trim() === 'download') { btn.click(); return; } }
    });
    recorder.click('button:has-text("download")', 'Click download');
    await page.waitForTimeout(5000);
    console.log("  ✅ Download initiated\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Project downloaded");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "overleaf_download_project.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "overleaf_download_project.py"), genPython(CFG, recorder), "utf-8");
    }
    throw err;
  } finally {
    if (stagehand) { console.log("🧹 Closing..."); await stagehand.close(); }
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
