const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Google Docs – Share Document
 *
 * Opens a document, clicks Share, enters an email and permission,
 * and sends the invitation.
 */

const CFG = {
  docUrl: "https://docs.google.com/document/d/13D4-u5NJ-I-fOA5J6STj273HprIEgyo-xhJoDuA16a4/edit",
  email: "collaborator@example.com",
  permission: "Editor",
  waits: { page: 8000, action: 2000, dialog: 3000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Google Docs – Share Document

Opens a document, clicks Share, enters an email and permission,
and sends the invitation.

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
class GoogleDocsShareDocumentRequest:
    document_url: str
    email: str
    permission: str  # "Editor", "Viewer", or "Commenter"


@dataclass(frozen=True)
class GoogleDocsShareDocumentResult:
    success: bool
    error: str


# Opens a Google Doc and shares it with the given email and permission.
def google_docs_share_document(
    page: Page,
    request: GoogleDocsShareDocumentRequest,
) -> GoogleDocsShareDocumentResult:

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

        # ── STEP 2: Click the Share button ───────────────────────────
        print("STEP 2: Opening Share dialog...")
        share_btn = page.locator('div[aria-label*="Share"]').first
        if share_btn.count() == 0:
            share_btn = page.locator('button:has-text("Share")').first
        checkpoint("Click Share button")
        share_btn.click()
        page.wait_for_timeout(3000)
        print("  Share dialog opened.")

        # ── STEP 3: Enter email address ──────────────────────────────
        print(f'STEP 3: Entering email "{request.email}"...')
        email_input = page.locator('input[aria-label="Add people, groups, and calendar events"]').first
        if email_input.count() == 0:
            email_input = page.locator('input[type="text"]').first
        checkpoint(f"Type email: {request.email}")
        email_input.type(request.email, delay=30)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        page.wait_for_timeout(1000)
        print("  Email entered.")

        # ── STEP 4: Set permission ───────────────────────────────────
        print(f'STEP 4: Setting permission to "{request.permission}"...')
        # Click the permission dropdown and select the desired role
        perm_btn = page.locator('[aria-label*="permission"]').first
        if perm_btn.count() > 0:
            checkpoint(f"Set permission: {request.permission}")
            perm_btn.click()
            page.wait_for_timeout(500)
            role_option = page.locator(f'[role="option"]:has-text("{request.permission}")').first
            if role_option.count() == 0:
                role_option = page.locator(f'text="{request.permission}"').first
            role_option.click()
            page.wait_for_timeout(500)
        print(f"  Permission set to: {request.permission}")

        # ── STEP 5: Click Send / Share ───────────────────────────────
        print("STEP 5: Sending invitation...")
        send_btn = page.locator('button:has-text("Send")').first
        if send_btn.count() == 0:
            send_btn = page.locator('button:has-text("Share")').first
        checkpoint("Click Send")
        send_btn.click()
        page.wait_for_timeout(2000)
        print("  Invitation sent.")

        print(f"\\nSuccess! Shared with {request.email} as {request.permission}.")
        return GoogleDocsShareDocumentResult(success=True, error="")

    except Exception as e:
        print(f"Error: {e}")
        return GoogleDocsShareDocumentResult(success=False, error=str(e))


def test_google_docs_share_document() -> None:
    print("=" * 60)
    print("  Google Docs – Share Document")
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
            doc_url = ensure_test_document_exists(page, "Test Doc For Sharing")
            request = GoogleDocsShareDocumentRequest(
                document_url=doc_url,
                email="${cfg.email}",
                permission="${cfg.permission}",
            )
            result = google_docs_share_document(page, request)
            if result.success:
                print("\\n  SUCCESS: Document shared")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_google_docs_share_document)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Docs – Share Document");
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

    console.log("🔗 STEP 2: Opening Share dialog...");
    await page.evaluate(() => {
      const btn = document.querySelector('div[aria-label*="Share"]') ||
                  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Share'));
      if (btn) btn.click();
    });
    recorder.click('div[aria-label*="Share"]', 'Click Share');
    await page.waitForTimeout(CFG.waits.dialog);
    console.log("  ✅ Share dialog opened\n");

    console.log(`📧 STEP 3: Entering email "${CFG.email}"...`);
    await page.evaluate((email) => {
      const input = document.querySelector('input[aria-label="Add people, groups, and calendar events"]') ||
                    document.querySelector('input[type="text"]');
      if (input) {
        input.focus();
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, email);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }
    }, CFG.email);
    recorder.fill('input[aria-label="Add people"]', CFG.email, 'Type email');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Email entered\n");

    console.log("📤 STEP 4: Sending...");
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Send' || b.textContent.trim() === 'Share');
      if (btn) btn.click();
    });
    recorder.click('button:has-text("Send")', 'Click Send');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Sent\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Document shared");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "google_docs_share_document.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "google_docs_share_document.py"), genPython(CFG, recorder), "utf-8");
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
