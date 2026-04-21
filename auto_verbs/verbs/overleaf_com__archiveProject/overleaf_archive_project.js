const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Overleaf – Archive Project
 *
 * Searches for a project on the dashboard, selects it, clicks archive, confirms.
 */

const CFG = {
  url: "https://www.overleaf.com/project",
  searchQuery: "My Paper 1",
  waits: { page: 5000, action: 2000, dialog: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Overleaf – Archive Project

Searches for an Overleaf project by name on the dashboard,
selects it, and archives it.

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
class OverleafArchiveProjectRequest:
    search_query: str


@dataclass(frozen=True)
class OverleafArchiveProjectResult:
    success: bool
    error: str


# Searches for a project by name on the Overleaf dashboard,
# selects it, clicks the archive button, and confirms.
def overleaf_archive_project(
    page: Page,
    request: OverleafArchiveProjectRequest,
) -> OverleafArchiveProjectResult:

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
            return OverleafArchiveProjectResult(
                success=False,
                error=f'No projects found matching "{request.search_query}"',
            )
        checkpoint("Click project checkbox")
        first_checkbox.click()
        page.wait_for_timeout(1000)
        print("  Project selected.")

        # ── STEP 4: Click the archive button ─────────────────────────
        print("STEP 4: Clicking archive button...")
        archive_btn = page.locator('button:has-text("inbox")').first
        checkpoint("Click archive button")
        archive_btn.click()
        page.wait_for_timeout(2000)
        print("  Archive dialog opened.")

        # ── STEP 5: Confirm archival ─────────────────────────────────
        print("STEP 5: Confirming archival...")
        dialog = page.locator('[role="dialog"]')
        dialog.wait_for(state="visible", timeout=5000)
        confirm_btn = dialog.locator('button:has-text("Confirm")')
        checkpoint("Click Confirm in dialog")
        confirm_btn.click()
        page.wait_for_timeout(2000)
        print("  Archival confirmed.")

        print("\\nSuccess! Project archived.")
        return OverleafArchiveProjectResult(success=True, error="")

    except Exception as e:
        print(f"Error: {e}")
        return OverleafArchiveProjectResult(success=False, error=str(e))


def test_overleaf_archive_project() -> None:
    print("=" * 60)
    print("  Overleaf – Archive Project")
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
            ensure_test_project_exists(page, "My Paper 1")
            request = OverleafArchiveProjectRequest(
                search_query="My Paper 1",
            )
            result = overleaf_archive_project(page, request)
            if result.success:
                print("\\n  SUCCESS: Project archived")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_overleaf_archive_project)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Overleaf – Archive Project");
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
    recorder.wait(CFG.waits.page, "Wait for dashboard");
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
    recorder.fill('input[placeholder="Search in all projects…"]', CFG.searchQuery, 'Type search query');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Search entered\n");

    console.log("☑️  STEP 3: Selecting first matching project...");
    await page.waitForSelector('td input[type="checkbox"]', { state: "visible", timeout: 5000 });
    await page.evaluate(() => { document.querySelector('td input[type="checkbox"]')?.click(); });
    recorder.click('td input[type="checkbox"]', 'Click project checkbox');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Project selected\n");

    console.log("📥 STEP 4: Clicking archive button...");
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) { if (btn.textContent.trim() === 'inbox') { btn.click(); return; } }
    });
    recorder.click('button:has-text("inbox")', 'Click archive button');
    await page.waitForTimeout(CFG.waits.dialog);
    console.log("  ✅ Archive dialog opened\n");

    console.log("✅ STEP 5: Confirming archival...");
    await page.waitForSelector('[role="dialog"]', { state: "visible", timeout: 5000 });
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const btns = dialog.querySelectorAll('button');
      for (const btn of btns) { if (btn.textContent.trim() === 'Confirm') { btn.click(); return; } }
    });
    recorder.click('button:has-text("Confirm")', 'Click Confirm');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Archival confirmed\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Project archived");
    console.log("═══════════════════════════════════════════════════════════");

    const pyScript = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "overleaf_archive_project.py"), pyScript, "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "overleaf_archive_project.py"), genPython(CFG, recorder), "utf-8");
      console.log("⚠️  Partial Python saved");
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
