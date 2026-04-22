const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Overleaf – Upload File
 *
 * Navigates to a project by ID, clicks Upload in the file tree sidebar,
 * uses the file chooser API to upload a local file.
 */

const CFG = {
  projectId: "69e6b0a3d05bcdbdf251587c",
  localFilePath: path.join(os.homedir(), "Downloads", "test_upload.txt"),
  waits: { page: 5000, action: 2000, editor: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Overleaf – Upload File

Navigates to a project by ID and uploads a local file
using the file tree sidebar Upload button and file chooser API.

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
class OverleafUploadFileRequest:
    project_id: str
    local_file_path: str


@dataclass(frozen=True)
class OverleafUploadFileResult:
    success: bool
    uploaded_file_name: str
    error: str


# Navigates to a project by ID and uploads a local file.
def overleaf_upload_file(
    page: Page,
    request: OverleafUploadFileRequest,
) -> OverleafUploadFileResult:

    try:
        if not os.path.isfile(request.local_file_path):
            return OverleafUploadFileResult(
                success=False, uploaded_file_name="",
                error=f"File not found: {request.local_file_path}",
            )

        file_name = os.path.basename(request.local_file_path)

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

        # ── STEP 2: Click Upload button in file tree ─────────────────
        print("STEP 2: Clicking Upload button...")
        upload_btn = page.locator('button[aria-label="Upload"]').first
        if upload_btn.count() == 0:
            upload_btn = page.locator('button:has-text("upload")').first
        checkpoint("Click Upload button")
        with page.expect_file_chooser() as fc_info:
            upload_btn.click()
        file_chooser = fc_info.value
        page.wait_for_timeout(1000)
        print("  File chooser opened.")

        # ── STEP 3: Set the file ─────────────────────────────────────
        print(f"STEP 3: Uploading {file_name}...")
        checkpoint(f"Upload file: {file_name}")
        file_chooser.set_files(request.local_file_path)
        page.wait_for_timeout(3000)
        print(f"  File uploaded: {file_name}")

        print(f"\\nSuccess! Uploaded: {file_name}")
        return OverleafUploadFileResult(
            success=True, uploaded_file_name=file_name, error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return OverleafUploadFileResult(
            success=False, uploaded_file_name="", error=str(e),
        )


def test_overleaf_upload_file() -> None:
    print("=" * 60)
    print("  Overleaf – Upload File")
    print("=" * 60)

    user_data_dir = os.path.join(
        os.environ["USERPROFILE"],
        "AppData", "Local", "Google", "Chrome", "User Data", "Default",
    )

    # Create a test file if it doesn't exist
    test_file = os.path.join(os.environ["USERPROFILE"], "Downloads", "test_upload.txt")
    if not os.path.exists(test_file):
        with open(test_file, "w") as f:
            f.write("This is a test upload file for Overleaf.\\n")

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
            request = OverleafUploadFileRequest(
                project_id=project_id,
                local_file_path=test_file,
            )
            result = overleaf_upload_file(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.uploaded_file_name}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_overleaf_upload_file)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Overleaf – Upload File");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    // Create test file if needed
    if (!fs.existsSync(CFG.localFilePath)) {
      fs.mkdirSync(path.dirname(CFG.localFilePath), { recursive: true });
      fs.writeFileSync(CFG.localFilePath, "This is a test upload file for Overleaf.\n", "utf-8");
      console.log(`📄 Created test file: ${CFG.localFilePath}\n`);
    }

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

    console.log("📤 STEP 2: Clicking Upload button...");
    // The upload button uses a file input under the hood; we find & click it
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Upload"]') ||
                  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'upload');
      if (btn) btn.click();
    });
    recorder.click('button[aria-label="Upload"]', 'Click Upload');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Upload clicked\n");

    // Note: In the JS exploration, we can't fully simulate the file chooser,
    // but we record the interaction for the Python file to use.
    console.log("📁 STEP 3: File chooser would open here (skipping in exploration)...");
    recorder.click("fileChooser.setFiles", "Upload file: " + CFG.localFilePath);
    console.log("  ✅ Recorded\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Upload flow explored");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "overleaf_upload_file.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "overleaf_upload_file.py"), genPython(CFG, recorder), "utf-8");
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
