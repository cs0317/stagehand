const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Google Docs – Insert Table
 *
 * Opens a document, clicks Insert > Table, selects a grid size
 * (e.g. 3x2), and inserts the table.
 */

const CFG = {
  docUrl: "https://docs.google.com/document/d/13D4-u5NJ-I-fOA5J6STj273HprIEgyo-xhJoDuA16a4/edit",
  rows: 2,
  cols: 3,
  waits: { page: 8000, action: 2000, menu: 1500 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Google Docs – Insert Table

Opens a document and inserts a table of the specified size
via Insert > Table > grid selector.

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
class GoogleDocsInsertTableRequest:
    document_url: str
    rows: int
    cols: int


@dataclass(frozen=True)
class GoogleDocsInsertTableResult:
    success: bool
    error: str


# Opens a Google Doc and inserts a table of the given size.
def google_docs_insert_table(
    page: Page,
    request: GoogleDocsInsertTableRequest,
) -> GoogleDocsInsertTableResult:

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

        # ── STEP 2: Click at end of document body ────────────────────
        print("STEP 2: Clicking document body...")
        doc_body = page.locator('.kix-appview-editor').first
        checkpoint("Click document body")
        doc_body.click()
        page.wait_for_timeout(500)
        # Press Ctrl+End to move to end
        page.keyboard.press("Control+End")
        page.wait_for_timeout(500)
        page.keyboard.press("Enter")
        page.wait_for_timeout(500)
        print("  Cursor at end of document.")

        # ── STEP 3: Open Insert menu ─────────────────────────────────
        print("STEP 3: Opening Insert menu...")
        insert_menu = page.locator('#docs-insert-menu').first
        if insert_menu.count() == 0:
            insert_menu = page.locator('div[id="docs-insert-menu"]').first
        checkpoint("Click Insert menu")
        insert_menu.click()
        page.wait_for_timeout(1500)
        print("  Insert menu opened.")

        # ── STEP 4: Hover over Table ─────────────────────────────────
        print("STEP 4: Hovering over Table...")
        table_item = page.locator('span:has-text("Table")').first
        checkpoint("Hover Table submenu")
        table_item.hover()
        page.wait_for_timeout(1500)
        print("  Table grid visible.")

        # ── STEP 5: Select table size ────────────────────────────────
        print(f"STEP 5: Selecting {request.cols}x{request.rows} table...")
        # The table size grid uses aria-label like "1 x 1" or data attributes
        # We need to click the cell at (cols, rows) in the grid
        cell_label = f"{request.cols} x {request.rows}"
        grid_cell = page.locator(f'[aria-label="{cell_label}"]').first
        if grid_cell.count() == 0:
            # Fallback: try id-based selector
            grid_cell = page.locator(
                f'td[data-column="{request.cols - 1}"][data-row="{request.rows - 1}"]'
            ).first
        checkpoint(f"Click table grid cell: {cell_label}")
        grid_cell.click()
        page.wait_for_timeout(2000)
        print(f"  Table {request.cols}x{request.rows} inserted.")

        print(f"\\nSuccess! Inserted {request.cols}x{request.rows} table.")
        return GoogleDocsInsertTableResult(success=True, error="")

    except Exception as e:
        print(f"Error: {e}")
        return GoogleDocsInsertTableResult(success=False, error=str(e))


def test_google_docs_insert_table() -> None:
    print("=" * 60)
    print("  Google Docs – Insert Table")
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
            doc_url = ensure_test_document_exists(page, "Test Doc For Table")
            request = GoogleDocsInsertTableRequest(
                document_url=doc_url,
                rows=${cfg.rows},
                cols=${cfg.cols},
            )
            result = google_docs_insert_table(page, request)
            if result.success:
                print("\\n  SUCCESS: Table inserted")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_google_docs_insert_table)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Docs – Insert Table");
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

    console.log("📝 STEP 2: Clicking document body...");
    await page.evaluate(() => {
      const body = document.querySelector('.kix-appview-editor');
      if (body) body.click();
    });
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true }));
    });
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    recorder.click('.kix-appview-editor', 'Click document body');
    await page.waitForTimeout(500);
    console.log("  ✅ Cursor positioned\n");

    console.log("📋 STEP 3: Opening Insert menu...");
    await page.evaluate(() => {
      const menu = document.querySelector('#docs-insert-menu');
      if (menu) menu.click();
    });
    recorder.click('#docs-insert-menu', 'Click Insert menu');
    await page.waitForTimeout(CFG.waits.menu);
    console.log("  ✅ Insert menu opened\n");

    console.log("📊 STEP 4: Hovering over Table...");
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('span')].filter(s => s.textContent.trim() === 'Table');
      if (items.length > 0) items[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    });
    recorder.click('span:has-text("Table")', 'Hover Table');
    await page.waitForTimeout(CFG.waits.menu);
    console.log("  ✅ Table grid visible\n");

    const cellLabel = `${CFG.cols} x ${CFG.rows}`;
    console.log(`📊 STEP 5: Selecting ${cellLabel} table...`);
    await page.evaluate((label) => {
      const cell = document.querySelector(`[aria-label="${label}"]`);
      if (cell) cell.click();
    }, cellLabel);
    recorder.click(`[aria-label="${cellLabel}"]`, 'Click table grid cell');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Table inserted\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Table inserted");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "google_docs_insert_table.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "google_docs_insert_table.py"), genPython(CFG, recorder), "utf-8");
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
