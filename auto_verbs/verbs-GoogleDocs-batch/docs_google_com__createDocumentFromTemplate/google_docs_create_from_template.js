const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Google Docs – Create Document From Template
 *
 * Opens the template gallery, picks a template by name, and renames
 * the resulting document.
 */

const CFG = {
  url: "https://docs.google.com/",
  templateName: "Letter",
  docName: "My Letter",
  waits: { page: 8000, action: 2000, editor: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Google Docs – Create Document From Template

Opens the template gallery, picks a template by name, and renames
the resulting document.

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
class GoogleDocsCreateFromTemplateRequest:
    template_name: str
    document_name: str


@dataclass(frozen=True)
class GoogleDocsCreateFromTemplateResult:
    success: bool
    document_url: str
    document_title: str
    error: str


# Opens the template gallery, picks a template by name, and renames the document.
def google_docs_create_from_template(
    page: Page,
    request: GoogleDocsCreateFromTemplateRequest,
) -> GoogleDocsCreateFromTemplateResult:

    try:
        # ── STEP 1: Navigate to Google Docs homepage ─────────────────
        print("STEP 1: Loading Google Docs homepage...")
        checkpoint("Navigate to Google Docs homepage")
        page.goto(
            "https://docs.google.com/",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Expand template gallery ──────────────────────────
        print("STEP 2: Expanding template gallery...")
        gallery_btn = page.locator('button:has-text("Template gallery")').first
        checkpoint("Click Template gallery")
        gallery_btn.click()
        page.wait_for_timeout(2000)
        print("  Template gallery expanded.")

        # ── STEP 3: Click the desired template ───────────────────────
        print(f'STEP 3: Selecting template "{request.template_name}"...')
        # Templates are shown as cards with aria-label or text
        template = page.locator(f'[aria-label*="{request.template_name}"]').first
        if template.count() == 0:
            template = page.locator(f'text="{request.template_name}"').first
        checkpoint(f"Click template: {request.template_name}")
        template.click()
        page.wait_for_timeout(8000)
        print("  Template loaded.")

        # ── STEP 4: Rename the document ──────────────────────────────
        print(f'STEP 4: Renaming document to "{request.document_name}"...')
        title_input = page.locator('input[aria-label="Rename"]').first
        checkpoint(f"Rename document: {request.document_name}")
        title_input.click()
        page.wait_for_timeout(500)
        title_input.press("Control+a")
        title_input.type(request.document_name, delay=30)
        title_input.press("Enter")
        page.wait_for_timeout(2000)
        print("  Renamed.")

        doc_url = page.url
        print(f"\\nSuccess! Document from template: {doc_url}")
        return GoogleDocsCreateFromTemplateResult(
            success=True,
            document_url=doc_url,
            document_title=request.document_name,
            error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return GoogleDocsCreateFromTemplateResult(
            success=False, document_url="", document_title="", error=str(e),
        )


def test_google_docs_create_from_template() -> None:
    print("=" * 60)
    print("  Google Docs – Create Document From Template")
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
            request = GoogleDocsCreateFromTemplateRequest(
                template_name="${cfg.templateName}",
                document_name="${cfg.docName}",
            )
            result = google_docs_create_from_template(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.document_url}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_google_docs_create_from_template)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Docs – Create Document From Template");
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

    console.log("🌐 STEP 1: Loading Google Docs homepage...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);
    console.log(`  ✅ Loaded: ${page.url()}\n`);

    console.log("📋 STEP 2: Expanding template gallery...");
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Template gallery'));
      if (btn) btn.click();
    });
    recorder.click('button:has-text("Template gallery")', 'Click Template gallery');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Gallery expanded\n");

    console.log(`📄 STEP 3: Selecting template "${CFG.templateName}"...`);
    await page.evaluate((name) => {
      const el = document.querySelector(`[aria-label*="${name}"]`) ||
                 [...document.querySelectorAll('*')].find(e => e.textContent.trim() === name);
      if (el) el.click();
    }, CFG.templateName);
    recorder.click(`[aria-label*="${CFG.templateName}"]`, 'Click template');
    await page.waitForTimeout(CFG.waits.editor);
    console.log("  ✅ Template loaded\n");

    console.log(`📝 STEP 4: Renaming to "${CFG.docName}"...`);
    await page.evaluate((name) => {
      const input = document.querySelector('input[aria-label="Rename"]');
      if (input) { input.focus(); input.select(); input.value = name; input.dispatchEvent(new Event('input', { bubbles: true })); }
    }, CFG.docName);
    recorder.fill('input[aria-label="Rename"]', CFG.docName, 'Rename document');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Renamed\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Document from template created");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "google_docs_create_from_template.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "google_docs_create_from_template.py"), genPython(CFG, recorder), "utf-8");
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
