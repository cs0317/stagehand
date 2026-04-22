const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Google Docs – Rename Document
 *
 * Opens a document by URL and renames it via the title input.
 */

const CFG = {
  docUrl: "https://docs.google.com/document/d/13D4-u5NJ-I-fOA5J6STj273HprIEgyo-xhJoDuA16a4/edit",
  newName: "Renamed Document",
  waits: { page: 8000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Google Docs – Rename Document

Opens a document by URL and renames it via the title input.

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
from google_docs_helpers import ensure_test_document_exists


@dataclass(frozen=True)
class GoogleDocsRenameDocumentRequest:
    document_url: str
    new_name: str


@dataclass(frozen=True)
class GoogleDocsRenameDocumentResult:
    success: bool
    new_title: str
    error: str


# Opens a Google Doc by URL and renames it.
def google_docs_rename_document(
    page: Page,
    request: GoogleDocsRenameDocumentRequest,
) -> GoogleDocsRenameDocumentResult:

    try:
        # ── STEP 1: Navigate to the document ─────────────────────────
        print("STEP 1: Loading document...")
        checkpoint("Navigate to document")
        page.goto(
            request.document_url,
            wait_until="domcontentloaded",
            timeout=30000,
        )
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Rename the document ──────────────────────────────
        print(f'STEP 2: Renaming to "{request.new_name}"...')
        title_input = page.locator('input[aria-label="Rename"]').first
        checkpoint(f"Rename document: {request.new_name}")
        title_input.click()
        page.wait_for_timeout(500)
        title_input.press("Control+a")
        title_input.type(request.new_name, delay=30)
        title_input.press("Enter")
        page.wait_for_timeout(2000)
        print(f"  Renamed to: {request.new_name}")

        print(f"\\nSuccess! Document renamed to \\"{request.new_name}\\".")
        return GoogleDocsRenameDocumentResult(
            success=True, new_title=request.new_name, error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return GoogleDocsRenameDocumentResult(
            success=False, new_title="", error=str(e),
        )


def test_google_docs_rename_document() -> None:
    print("=" * 60)
    print("  Google Docs – Rename Document")
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
            doc_url = ensure_test_document_exists(page, "Test Doc For Rename")
            request = GoogleDocsRenameDocumentRequest(
                document_url=doc_url,
                new_name="${cfg.newName}",
            )
            result = google_docs_rename_document(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.new_title}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_google_docs_rename_document)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Docs – Rename Document");
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

    console.log("🌐 STEP 1: Loading document...");
    recorder.goto(CFG.docUrl);
    await page.goto(CFG.docUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);
    console.log(`  ✅ Loaded: ${page.url()}\n`);

    console.log(`📝 STEP 2: Renaming to "${CFG.newName}"...`);
    await page.evaluate((name) => {
      const input = document.querySelector('input[aria-label="Rename"]');
      if (input) {
        input.focus(); input.select();
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, name);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, CFG.newName);
    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="Rename"]');
      if (input) { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); input.blur(); }
    });
    recorder.fill('input[aria-label="Rename"]', CFG.newName, 'Rename document');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Renamed\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Document renamed");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "google_docs_rename_document.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "google_docs_rename_document.py"), genPython(CFG, recorder), "utf-8");
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
