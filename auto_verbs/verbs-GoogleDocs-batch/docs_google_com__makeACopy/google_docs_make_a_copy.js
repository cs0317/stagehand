const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Google Docs – Make a Copy
 *
 * Opens a document, uses File > Make a copy, confirms the dialog,
 * and returns the new document URL.
 */

const CFG = {
  docUrl: "https://docs.google.com/document/d/13D4-u5NJ-I-fOA5J6STj273HprIEgyo-xhJoDuA16a4/edit",
  copyName: "Copy of Test Document 1",
  waits: { page: 8000, action: 2000, menu: 1500, newTab: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Google Docs – Make a Copy

Opens a document, uses File > Make a copy, confirms the dialog,
and returns the new document URL.

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
class GoogleDocsMakeACopyRequest:
    document_url: str
    copy_name: str


@dataclass(frozen=True)
class GoogleDocsMakeACopyResult:
    success: bool
    new_document_url: str
    new_document_title: str
    error: str


# Opens a Google Doc and makes a copy via File > Make a copy.
def google_docs_make_a_copy(
    page: Page,
    request: GoogleDocsMakeACopyRequest,
) -> GoogleDocsMakeACopyResult:

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

        # ── STEP 3: Click "Make a copy" ──────────────────────────────
        print("STEP 3: Clicking Make a copy...")
        copy_item = page.locator('span:has-text("Make a copy")').first
        if copy_item.count() == 0:
            copy_item = page.locator('[aria-label*="Make a copy"]').first
        checkpoint("Click Make a copy")
        copy_item.click()
        page.wait_for_timeout(2000)
        print("  Copy dialog opened.")

        # ── STEP 4: Set the copy name ────────────────────────────────
        print(f'STEP 4: Setting copy name to "{request.copy_name}"...')
        name_input = page.locator('input[type="text"]').first
        checkpoint(f"Type copy name: {request.copy_name}")
        name_input.press("Control+a")
        name_input.type(request.copy_name, delay=30)
        page.wait_for_timeout(500)
        print("  Name set.")

        # ── STEP 5: Confirm the copy ─────────────────────────────────
        print("STEP 5: Confirming copy...")
        context = page.context
        with context.expect_page(timeout=15000) as new_page_info:
            ok_btn = page.locator('button:has-text("Make a copy")').first
            if ok_btn.count() == 0:
                ok_btn = page.locator('button:has-text("OK")').first
            checkpoint("Click Make a copy / OK")
            ok_btn.click()
        new_page = new_page_info.value
        new_page.wait_for_load_state("domcontentloaded")
        new_page.wait_for_timeout(5000)
        new_url = new_page.url
        print(f"  Copy created: {new_url}")

        print(f"\\nSuccess! Copy at {new_url}")
        return GoogleDocsMakeACopyResult(
            success=True,
            new_document_url=new_url,
            new_document_title=request.copy_name,
            error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return GoogleDocsMakeACopyResult(
            success=False, new_document_url="", new_document_title="", error=str(e),
        )


def test_google_docs_make_a_copy() -> None:
    print("=" * 60)
    print("  Google Docs – Make a Copy")
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
            doc_url = ensure_test_document_exists(page, "Test Doc For Copy")
            request = GoogleDocsMakeACopyRequest(
                document_url=doc_url,
                copy_name="${cfg.copyName}",
            )
            result = google_docs_make_a_copy(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.new_document_url}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_google_docs_make_a_copy)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Docs – Make a Copy");
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

    console.log("📋 STEP 3: Clicking Make a copy...");
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('span')].filter(s => s.textContent.trim() === 'Make a copy');
      if (items.length > 0) items[0].click();
    });
    recorder.click('span:has-text("Make a copy")', 'Click Make a copy');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Dialog opened\n");

    console.log(`📝 STEP 4: Setting copy name to "${CFG.copyName}"...`);
    await page.evaluate((name) => {
      const el = document.querySelector('input[type="text"]');
      if (el) {
        el.focus(); el.select();
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(el, name);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, CFG.copyName);
    recorder.fill('input[type="text"]', CFG.copyName, 'Type copy name');
    await page.waitForTimeout(500);
    console.log("  ✅ Name set\n");

    console.log("✅ STEP 5: Confirming copy...");
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter(b =>
        b.textContent.trim() === 'Make a copy' || b.textContent.trim() === 'OK');
      if (btns.length > 0) btns[0].click();
    });
    recorder.click('button:has-text("Make a copy")', 'Click Make a copy confirm');
    await page.waitForTimeout(CFG.waits.newTab);
    console.log("  ✅ Copy created\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Document copied");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "google_docs_make_a_copy.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "google_docs_make_a_copy.py"), genPython(CFG, recorder), "utf-8");
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
