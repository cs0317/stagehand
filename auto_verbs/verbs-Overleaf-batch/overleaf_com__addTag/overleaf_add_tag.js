const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Overleaf – Add Tag
 *
 * Creates a new tag on the Overleaf dashboard.
 */

const CFG = {
  url: "https://www.overleaf.com/project",
  tagName: "test-tag",
  waits: { page: 5000, action: 2000, dialog: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Overleaf – Add Tag

Creates a new tag on the Overleaf dashboard.

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
class OverleafAddTagRequest:
    tag_name: str


@dataclass(frozen=True)
class OverleafAddTagResult:
    success: bool
    error: str


# Creates a new tag on the Overleaf dashboard.
def overleaf_add_tag(
    page: Page,
    request: OverleafAddTagRequest,
) -> OverleafAddTagResult:

    try:
        # ── STEP 1: Navigate to project dashboard ────────────────────
        print("STEP 1: Loading Overleaf project dashboard...")
        checkpoint("Navigate to project dashboard")
        page.goto(
            "https://www.overleaf.com/project",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Click "New Tag" in the sidebar ───────────────────
        print(f'STEP 2: Creating tag "{request.tag_name}"...')
        new_tag_btn = page.locator('button:has-text("New Tag")').first
        if new_tag_btn.count() == 0:
            new_tag_btn = page.locator('a:has-text("New Tag")').first
        checkpoint("Click New Tag button")
        new_tag_btn.click()
        page.wait_for_timeout(1000)

        # Enter tag name in the input that appears
        tag_input = page.locator('input[placeholder="Tag Name"]').first
        if tag_input.count() == 0:
            tag_input = page.locator(
                'input[name="new-tag-form-name"]'
            ).first
        if tag_input.count() == 0:
            tag_input = page.locator(
                '[role="dialog"] input[type="text"]'
            ).first
        checkpoint(f"Type tag name: {request.tag_name}")
        tag_input.type(request.tag_name, delay=30)
        page.wait_for_timeout(500)

        # Confirm tag creation
        create_btn = page.locator('button:has-text("Create")').first
        checkpoint("Click Create tag")
        create_btn.click()
        page.wait_for_timeout(2000)
        print(f"  Tag created: {request.tag_name}")

        print(f"\\nSuccess! Tag \\"{request.tag_name}\\" created.")
        return OverleafAddTagResult(success=True, error="")

    except Exception as e:
        print(f"Error: {e}")
        return OverleafAddTagResult(success=False, error=str(e))


def test_overleaf_add_tag() -> None:
    print("=" * 60)
    print("  Overleaf – Add Tag")
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
            request = OverleafAddTagRequest(
                tag_name="${cfg.tagName}",
            )
            result = overleaf_add_tag(page, request)
            if result.success:
                print("\\n  SUCCESS: Tag created")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_overleaf_add_tag)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Overleaf – Add Tag");
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

    console.log("🌐 STEP 1: Loading project dashboard...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);
    console.log(`  ✅ Loaded\n`);

    console.log(`🏷️  STEP 2: Creating tag "${CFG.tagName}"...`);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button'), ...document.querySelectorAll('a')];
      for (const b of btns) { if (b.textContent.includes('New Tag')) { b.click(); return; } }
    });
    recorder.click('button:has-text("New Tag")', 'Click New Tag');
    await page.waitForTimeout(CFG.waits.action);

    // Type tag name in the input
    await page.evaluate((name) => {
      const input = document.querySelector('input[placeholder="Tag Name"]') ||
                    document.querySelector('input[name="new-tag-form-name"]') ||
                    document.querySelector('[role="dialog"] input[type="text"]');
      if (input) {
        input.focus();
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, name);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, CFG.tagName);
    recorder.fill('input[placeholder="Tag Name"]', CFG.tagName, 'Type tag name');
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) { if (btn.textContent.trim() === 'Create') { btn.click(); return; } }
    });
    recorder.click('button:has-text("Create")', 'Click Create');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Tag created\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Tag created");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "overleaf_add_tag.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "overleaf_add_tag.py"), genPython(CFG, recorder), "utf-8");
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
