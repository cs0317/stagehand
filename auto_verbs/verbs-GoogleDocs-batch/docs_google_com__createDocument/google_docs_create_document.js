const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Google Docs – Create Document
 *
 * Creates a new blank Google Doc, renames it, and types sample text.
 */

const CFG = {
  url: "https://docs.google.com/document/create",
  docName: "Test Document 1",
  sampleText: "Hello, this is a test document.",
  waits: { page: 8000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Google Docs – Create Document

Creates a new blank Google Doc, renames it, and types sample text.

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


@dataclass(frozen=True)
class GoogleDocsCreateDocumentRequest:
    document_name: str
    sample_text: str


@dataclass(frozen=True)
class GoogleDocsCreateDocumentResult:
    success: bool
    document_url: str
    document_title: str
    error: str


# Creates a new blank Google Doc, renames it, and types sample text.
def google_docs_create_document(
    page: Page,
    request: GoogleDocsCreateDocumentRequest,
) -> GoogleDocsCreateDocumentResult:

    try:
        # ── STEP 1: Navigate to create new document ──────────────────
        print("STEP 1: Creating new Google Doc...")
        checkpoint("Navigate to create new document")
        page.goto(
            "https://docs.google.com/document/create",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Rename the document ──────────────────────────────
        print(f'STEP 2: Renaming document to "{request.document_name}"...')
        title_input = page.locator('input[aria-label="Rename"]').first
        checkpoint(f"Rename document: {request.document_name}")
        title_input.click()
        page.wait_for_timeout(500)
        title_input.press("Control+a")
        title_input.type(request.document_name, delay=30)
        title_input.press("Enter")
        page.wait_for_timeout(2000)
        print("  Renamed.")

        # ── STEP 3: Type sample text ─────────────────────────────────
        print("STEP 3: Typing sample text...")
        # Click on the document body to focus
        doc_body = page.locator('.kix-appview-editor').first
        checkpoint("Click document body")
        doc_body.click()
        page.wait_for_timeout(500)
        checkpoint(f"Type sample text")
        page.keyboard.type(request.sample_text, delay=20)
        page.wait_for_timeout(2000)
        print("  Text typed.")

        doc_url = page.url
        print(f"\\nSuccess! Document created: {doc_url}")
        return GoogleDocsCreateDocumentResult(
            success=True,
            document_url=doc_url,
            document_title=request.document_name,
            error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return GoogleDocsCreateDocumentResult(
            success=False, document_url="", document_title="", error=str(e),
        )


def test_google_docs_create_document() -> None:
    print("=" * 60)
    print("  Google Docs – Create Document")
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
            request = GoogleDocsCreateDocumentRequest(
                document_name="${cfg.docName}",
                sample_text="${cfg.sampleText}",
            )
            result = google_docs_create_document(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.document_url}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_google_docs_create_document)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Docs – Create Document");
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

    console.log("🌐 STEP 1: Creating new Google Doc...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);
    console.log(`  ✅ Loaded: ${page.url()}\n`);

    console.log(`📝 STEP 2: Renaming to "${CFG.docName}"...`);
    await page.evaluate((name) => {
      const input = document.querySelector('input[aria-label="Rename"]');
      if (input) { input.focus(); input.select(); input.value = name; input.dispatchEvent(new Event('input', { bubbles: true })); }
    }, CFG.docName);
    recorder.fill('input[aria-label="Rename"]', CFG.docName, 'Rename document');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Renamed\n");

    console.log("📝 STEP 3: Typing sample text...");
    await page.evaluate(() => {
      const body = document.querySelector('.kix-appview-editor');
      if (body) body.click();
    });
    await page.waitForTimeout(500);
    await stagehand.act(`type '${CFG.sampleText}' into the document body`);
    recorder.fill('.kix-appview-editor', CFG.sampleText, 'Type sample text');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Text typed\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Document created");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "google_docs_create_document.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "google_docs_create_document.py"), genPython(CFG, recorder), "utf-8");
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
