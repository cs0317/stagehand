const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Google Docs – Find and Replace
 *
 * Opens a document, opens Find and Replace (Ctrl+H), enters search/replace
 * text, clicks Replace All, and returns the replacement count.
 */

const CFG = {
  docUrl: "https://docs.google.com/document/d/13D4-u5NJ-I-fOA5J6STj273HprIEgyo-xhJoDuA16a4/edit",
  findText: "hello",
  replaceText: "world",
  waits: { page: 8000, action: 2000, dialog: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Google Docs – Find and Replace

Opens a document, opens Find and Replace (Ctrl+H), enters search
and replacement text, clicks Replace All, and returns the count.

Generated on: ${ts}
Recorded ${n} browser interactions

Uses the user's Chrome profile for persistent login state.
"""

import os
import re
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint
from google_docs_helpers import ensure_test_document_exists


@dataclass(frozen=True)
class GoogleDocsFindAndReplaceRequest:
    document_url: str
    find_text: str
    replace_text: str


@dataclass(frozen=True)
class GoogleDocsFindAndReplaceResult:
    success: bool
    replacements_count: int
    error: str


# Opens a Google Doc and performs Find and Replace.
def google_docs_find_and_replace(
    page: Page,
    request: GoogleDocsFindAndReplaceRequest,
) -> GoogleDocsFindAndReplaceResult:

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

        # ── STEP 2: Open Find and Replace (Ctrl+H) ──────────────────
        print("STEP 2: Opening Find and Replace...")
        checkpoint("Open Find and Replace (Ctrl+H)")
        page.keyboard.press("Control+h")
        page.wait_for_timeout(2000)
        print("  Dialog opened.")

        # ── STEP 3: Enter find text ──────────────────────────────────
        print(f'STEP 3: Entering find text "{request.find_text}"...')
        find_input = page.locator('input[aria-label="Find"]').first
        if find_input.count() == 0:
            find_input = page.locator('[aria-label="Find in document"] input').first
        checkpoint(f"Type find text: {request.find_text}")
        find_input.click()
        find_input.press("Control+a")
        find_input.type(request.find_text, delay=30)
        page.wait_for_timeout(1000)
        print("  Find text entered.")

        # ── STEP 4: Enter replace text ───────────────────────────────
        print(f'STEP 4: Entering replace text "{request.replace_text}"...')
        replace_input = page.locator('input[aria-label="Replace with"]').first
        if replace_input.count() == 0:
            replace_input = page.locator('[aria-label="Replace with"] input').first
        checkpoint(f"Type replace text: {request.replace_text}")
        replace_input.click()
        replace_input.press("Control+a")
        replace_input.type(request.replace_text, delay=30)
        page.wait_for_timeout(1000)
        print("  Replace text entered.")

        # ── STEP 5: Click Replace All ────────────────────────────────
        print("STEP 5: Clicking Replace All...")
        replace_all_btn = page.locator('button:has-text("Replace all")').first
        if replace_all_btn.count() == 0:
            replace_all_btn = page.locator('[aria-label="Replace all"]').first
        checkpoint("Click Replace All")
        replace_all_btn.click()
        page.wait_for_timeout(2000)

        # Try to read the replacement count from the status
        status_text = ""
        status_el = page.locator('.docs-findinput-count').first
        if status_el.count() > 0:
            status_text = status_el.text_content() or ""
        count = 0
        match = re.search(r"(\\d+)", status_text)
        if match:
            count = int(match.group(1))
        print(f"  Replacements: {count}")

        # ── STEP 6: Close dialog ─────────────────────────────────────
        print("STEP 6: Closing Find and Replace dialog...")
        checkpoint("Close Find and Replace dialog")
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        print("  Dialog closed.")

        print(f"\\nSuccess! Replaced {count} occurrences.")
        return GoogleDocsFindAndReplaceResult(
            success=True, replacements_count=count, error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return GoogleDocsFindAndReplaceResult(
            success=False, replacements_count=0, error=str(e),
        )


def test_google_docs_find_and_replace() -> None:
    print("=" * 60)
    print("  Google Docs – Find and Replace")
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
            doc_url = ensure_test_document_exists(page, "Test Doc For FindReplace")
            request = GoogleDocsFindAndReplaceRequest(
                document_url=doc_url,
                find_text="${cfg.findText}",
                replace_text="${cfg.replaceText}",
            )
            result = google_docs_find_and_replace(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.replacements_count} replacements")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_google_docs_find_and_replace)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Docs – Find and Replace");
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

    console.log("🔍 STEP 2: Opening Find and Replace (Ctrl+H)...");
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true }));
    });
    recorder.click('keyboard', 'Press Ctrl+H');
    await page.waitForTimeout(CFG.waits.dialog);
    // Fallback: use Edit > Find and Replace menu if Ctrl+H didn't work
    const dialogOpened = await page.evaluate(() => !!document.querySelector('input[aria-label="Find"]'));
    if (!dialogOpened) {
      await page.evaluate(() => {
        const editMenu = document.querySelector('#docs-edit-menu');
        if (editMenu) editMenu.click();
      });
      await page.waitForTimeout(1000);
      await page.evaluate(() => {
        const items = [...document.querySelectorAll('[role="menuitem"]')];
        const fr = items.find(i => i.textContent.includes('Find and replace'));
        if (fr) fr.click();
      });
      await page.waitForTimeout(CFG.waits.dialog);
    }
    console.log("  ✅ Dialog opened\n");

    console.log(`🔍 STEP 3: Entering find text "${CFG.findText}"...`);
    await page.evaluate((text) => {
      const input = document.querySelector('input[aria-label="Find"]') ||
                    document.querySelector('[aria-label="Find in document"] input');
      if (input) {
        input.focus(); input.click();
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, CFG.findText);
    recorder.fill('input[aria-label="Find"]', CFG.findText, 'Type find text');
    await page.waitForTimeout(1000);
    console.log("  ✅ Find text entered\n");

    console.log(`📝 STEP 4: Entering replace text "${CFG.replaceText}"...`);
    await page.evaluate((text) => {
      const input = document.querySelector('input[aria-label="Replace with"]') ||
                    document.querySelector('[aria-label="Replace with"] input');
      if (input) {
        input.focus(); input.click();
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, CFG.replaceText);
    recorder.fill('input[aria-label="Replace with"]', CFG.replaceText, 'Type replace text');
    await page.waitForTimeout(1000);
    console.log("  ✅ Replace text entered\n");

    console.log("🔄 STEP 5: Clicking Replace All...");
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Replace all');
      if (btns.length > 0) btns[0].click();
    });
    recorder.click('button:has-text("Replace all")', 'Click Replace All');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Replaced\n");

    console.log("❌ STEP 6: Closing dialog...");
    await page.evaluate(() => {
      const closeBtn = document.querySelector('[aria-label="Close"]') ||
                       document.querySelector('.docs-findinput-close');
      if (closeBtn) closeBtn.click();
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    recorder.click('keyboard', 'Press Escape');
    await page.waitForTimeout(500);
    console.log("  ✅ Closed\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Find and Replace complete");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "google_docs_find_and_replace.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "google_docs_find_and_replace.py"), genPython(CFG, recorder), "utf-8");
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
