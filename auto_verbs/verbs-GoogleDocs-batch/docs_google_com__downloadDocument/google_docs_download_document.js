const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Google Docs – Download Document
 *
 * Opens a document, uses File > Download to save in the desired format.
 */

const CFG = {
  docUrl: "https://docs.google.com/document/d/13D4-u5NJ-I-fOA5J6STj273HprIEgyo-xhJoDuA16a4/edit",
  format: "PDF Document (.pdf)",
  waits: { page: 8000, action: 2000, menu: 1500 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Google Docs – Download Document

Opens a document and downloads it via File > Download in the
desired format.

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
class GoogleDocsDownloadDocumentRequest:
    document_url: str
    format: str  # e.g. "PDF Document (.pdf)", "Microsoft Word (.docx)"


@dataclass(frozen=True)
class GoogleDocsDownloadDocumentResult:
    success: bool
    downloaded_file: str
    error: str


# Opens a Google Doc and downloads it in the specified format.
def google_docs_download_document(
    page: Page,
    request: GoogleDocsDownloadDocumentRequest,
) -> GoogleDocsDownloadDocumentResult:

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

        # ── STEP 2: Open File menu ───────────────────────────────────
        print("STEP 2: Opening File menu...")
        file_menu = page.locator('#docs-file-menu').first
        if file_menu.count() == 0:
            file_menu = page.locator('div[id="docs-file-menu"]').first
        checkpoint("Click File menu")
        file_menu.click()
        page.wait_for_timeout(1500)
        print("  File menu opened.")

        # ── STEP 3: Hover over Download ──────────────────────────────
        print("STEP 3: Hovering over Download...")
        download_item = page.locator('[aria-label*="Download"]').first
        if download_item.count() == 0:
            download_item = page.locator('span:has-text("Download")').first
        checkpoint("Hover Download submenu")
        download_item.hover()
        page.wait_for_timeout(1500)
        print("  Download submenu opened.")

        # ── STEP 4: Click desired format ─────────────────────────────
        print(f'STEP 4: Clicking format "{request.format}"...')
        # Start download listener before clicking
        with page.expect_download(timeout=15000) as download_info:
            format_item = page.locator(f'span:has-text("{request.format}")').first
            if format_item.count() == 0:
                format_item = page.locator(f'[aria-label*="{request.format}"]').first
            checkpoint(f"Click format: {request.format}")
            format_item.click()
        download = download_info.value
        downloaded_path = download.path()
        suggested = download.suggested_filename
        page.wait_for_timeout(2000)
        print(f"  Downloaded: {suggested}")

        print(f"\\nSuccess! Downloaded as {suggested}")
        return GoogleDocsDownloadDocumentResult(
            success=True, downloaded_file=suggested, error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return GoogleDocsDownloadDocumentResult(
            success=False, downloaded_file="", error=str(e),
        )


def test_google_docs_download_document() -> None:
    print("=" * 60)
    print("  Google Docs – Download Document")
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
            doc_url = ensure_test_document_exists(page, "Test Doc For Download")
            request = GoogleDocsDownloadDocumentRequest(
                document_url=doc_url,
                format="${cfg.format}",
            )
            result = google_docs_download_document(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.downloaded_file}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_google_docs_download_document)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Docs – Download Document");
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

    console.log("📁 STEP 2: Opening File menu...");
    await page.evaluate(() => {
      const menu = document.querySelector('#docs-file-menu');
      if (menu) menu.click();
    });
    recorder.click('#docs-file-menu', 'Click File menu');
    await page.waitForTimeout(CFG.waits.menu);
    console.log("  ✅ File menu opened\n");

    console.log("📥 STEP 3: Hovering Download...");
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('span')].filter(s => s.textContent.trim() === 'Download');
      if (items.length > 0) items[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    });
    recorder.click('span:has-text("Download")', 'Hover Download');
    await page.waitForTimeout(CFG.waits.menu);
    console.log("  ✅ Submenu opened\n");

    console.log(`📄 STEP 4: Clicking "${CFG.format}"...`);
    await page.evaluate((fmt) => {
      const items = [...document.querySelectorAll('span')].filter(s => s.textContent.includes(fmt));
      if (items.length > 0) items[0].click();
    }, CFG.format);
    recorder.click(`span:has-text("${CFG.format}")`, 'Click format');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Download started\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Document downloaded");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "google_docs_download_document.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "google_docs_download_document.py"), genPython(CFG, recorder), "utf-8");
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
