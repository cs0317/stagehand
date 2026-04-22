const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Overleaf – Create Folder
 *
 * Navigates to a project by ID, clicks New Folder in the file tree,
 * types the folder name, and confirms.
 */

const CFG = {
  projectId: "69e6b0a3d05bcdbdf251587c",
  folderName: "test_folder",
  waits: { page: 5000, action: 2000, editor: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Overleaf – Create Folder

Navigates to a project by ID and creates a new folder
in the file tree sidebar.

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
class OverleafCreateFolderRequest:
    project_id: str
    folder_name: str


@dataclass(frozen=True)
class OverleafCreateFolderResult:
    success: bool
    folder_name: str
    error: str


# Navigates to a project by ID and creates a new folder in the file tree.
def overleaf_create_folder(
    page: Page,
    request: OverleafCreateFolderRequest,
) -> OverleafCreateFolderResult:

    try:
        # ── STEP 1: Navigate to project editor ──────────────────────
        print("STEP 1: Loading project editor...")
        checkpoint("Navigate to project editor")
        page.goto(
            f"https://www.overleaf.com/project/{request.project_id}",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Click New Folder button ──────────────────────────
        print("STEP 2: Clicking New Folder button...")
        folder_btn = page.locator('button[aria-label="New Folder"]').first
        if folder_btn.count() == 0:
            folder_btn = page.locator('button:has-text("create_new_folder")').first
        checkpoint("Click New Folder button")
        folder_btn.click()
        page.wait_for_timeout(1000)
        print("  New folder dialog opened.")

        # ── STEP 3: Enter folder name ────────────────────────────────
        print(f'STEP 3: Entering folder name "{request.folder_name}"...')
        name_input = page.locator('input[placeholder="Folder Name"]').first
        if name_input.count() == 0:
            # Fallback: find input in the dialog/form
            name_input = page.locator('[role="dialog"] input[type="text"]').first
        checkpoint(f"Type folder name: {request.folder_name}")
        name_input.press("Control+a")
        name_input.type(request.folder_name, delay=30)
        page.wait_for_timeout(500)
        print("  Name entered.")

        # ── STEP 4: Confirm folder creation ──────────────────────────
        print("STEP 4: Confirming folder creation...")
        create_btn = page.locator('button:has-text("Create")').first
        checkpoint("Click Create button")
        create_btn.click()
        page.wait_for_timeout(2000)
        print(f"  Folder created: {request.folder_name}")

        print(f"\\nSuccess! Created folder: {request.folder_name}")
        return OverleafCreateFolderResult(
            success=True, folder_name=request.folder_name, error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return OverleafCreateFolderResult(
            success=False, folder_name="", error=str(e),
        )


def test_overleaf_create_folder() -> None:
    print("=" * 60)
    print("  Overleaf – Create Folder")
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
            project_id = ensure_test_project_exists(page, "My Paper 1")
            request = OverleafCreateFolderRequest(
                project_id=project_id,
                folder_name="${cfg.folderName}",
            )
            result = overleaf_create_folder(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.folder_name}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_overleaf_create_folder)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Overleaf – Create Folder");
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
    const projectUrl = `https://www.overleaf.com/project/${CFG.projectId}`;

    console.log("🌐 STEP 1: Loading project editor...");
    recorder.goto(projectUrl);
    await page.goto(projectUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.editor);
    console.log(`  ✅ Loaded: ${page.url()}\n`);

    console.log("📁 STEP 2: Clicking New Folder button...");
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="New Folder"]') ||
                  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'create_new_folder');
      if (btn) btn.click();
    });
    recorder.click('button[aria-label="New Folder"]', 'Click New Folder');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Dialog opened\n");

    console.log(`📝 STEP 3: Entering folder name "${CFG.folderName}"...`);
    await page.evaluate((name) => {
      const input = document.querySelector('input[placeholder="Folder Name"]') ||
                    document.querySelector('[role="dialog"] input[type="text"]');
      if (input) {
        input.focus(); input.select();
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, name);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, CFG.folderName);
    recorder.fill('input[placeholder="Folder Name"]', CFG.folderName, 'Type folder name');
    await page.waitForTimeout(500);
    console.log("  ✅ Name entered\n");

    console.log("✅ STEP 4: Clicking Create...");
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) { if (btn.textContent.trim() === 'Create') { btn.click(); return; } }
    });
    recorder.click('button:has-text("Create")', 'Click Create');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Folder created\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Folder created");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "overleaf_create_folder.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "overleaf_create_folder.py"), genPython(CFG, recorder), "utf-8");
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
