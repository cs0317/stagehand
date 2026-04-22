const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Overleaf – Copy Project
 *
 * Opens a project, clicks title dropdown → Make a copy, enters name, copies.
 */

const CFG = {
  url: "https://www.overleaf.com/project",
  searchQuery: "My Paper 1",
  copyName: "My Paper 1 (Copy)",
  waits: { page: 5000, action: 2000, editor: 8000, dialog: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Overleaf – Copy Project

Searches for a project, opens it, and makes a copy via the editor
title dropdown menu.

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
from overleaf_helpers import ensure_test_project_exists


@dataclass(frozen=True)
class OverleafCopyProjectRequest:
    search_query: str
    copy_name: str


@dataclass(frozen=True)
class OverleafCopyProjectResult:
    success: bool
    new_project_url: str
    error: str


# Searches for a project, opens it, and copies it with a new name.
def overleaf_copy_project(
    page: Page,
    request: OverleafCopyProjectRequest,
) -> OverleafCopyProjectResult:

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

        # ── STEP 2: Search for project ───────────────────────────────
        print(f'STEP 2: Searching for "{request.search_query}"...')
        search_input = page.locator(
            'input[placeholder="Search in all projects\\u2026"]'
        ).first
        checkpoint("Click search input")
        search_input.click()
        page.wait_for_timeout(500)
        search_input.press("Control+a")
        checkpoint(f"Type search query: {request.search_query}")
        search_input.type(request.search_query, delay=50)
        page.wait_for_timeout(2000)
        print("  Search entered.")

        # ── STEP 3: Click the first matching project ─────────────────
        print("STEP 3: Clicking first matching project...")
        project_links = page.locator('td a[href^="/project/"]')
        if project_links.count() == 0:
            return OverleafCopyProjectResult(
                success=False, new_project_url="",
                error=f'No projects found matching "{request.search_query}"',
            )
        checkpoint("Click first project link")
        project_links.first.click()
        page.wait_for_timeout(8000)
        print(f"  Opened: {page.url}")

        # ── STEP 4: Click title dropdown → Make a copy ───────────────
        print("STEP 4: Opening title dropdown...")
        title_btn = page.locator('button[aria-label="Project title options"]').first
        if title_btn.count() == 0:
            title_btn = page.locator('button:has-text("keyboard_arrow_down")').first
        checkpoint("Click project title dropdown")
        title_btn.click()
        page.wait_for_timeout(1000)

        print("STEP 5: Clicking Make a copy...")
        copy_link = page.locator('a:has-text("Make a copy")').first
        checkpoint("Click Make a copy")
        copy_link.click()
        page.wait_for_timeout(2000)
        print("  Copy dialog opened.")

        # ── STEP 6: Enter copy name and confirm ─────────────────────
        print(f'STEP 6: Entering copy name "{request.copy_name}"...')
        dialog = page.locator('[role="dialog"]')
        dialog.wait_for(state="visible", timeout=5000)
        name_input = dialog.locator('input[type="text"]').first
        checkpoint(f"Type copy name: {request.copy_name}")
        name_input.press("Control+a")
        name_input.type(request.copy_name, delay=30)
        page.wait_for_timeout(500)

        copy_btn = dialog.locator('button:has-text("Copy")')
        checkpoint("Click Copy button")
        copy_btn.click()
        page.wait_for_timeout(5000)

        # After copy, we should be redirected to the new project
        new_url = page.url
        print(f"  Copied. New URL: {new_url}")

        print(f"\\nSuccess! Project copied. URL: {new_url}")
        return OverleafCopyProjectResult(
            success=True, new_project_url=new_url, error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return OverleafCopyProjectResult(
            success=False, new_project_url="", error=str(e),
        )


def test_overleaf_copy_project() -> None:
    print("=" * 60)
    print("  Overleaf – Copy Project")
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
            ensure_test_project_exists(page, "${cfg.searchQuery}")
            request = OverleafCopyProjectRequest(
                search_query="${cfg.searchQuery}",
                copy_name="${cfg.copyName}",
            )
            result = overleaf_copy_project(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.new_project_url}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_overleaf_copy_project)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Overleaf – Copy Project");
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

    console.log(`🔍 STEP 2: Searching for "${CFG.searchQuery}"...`);
    await page.evaluate((q) => {
      const input = document.querySelector('input[placeholder="Search in all projects…"]');
      input.focus(); input.value = '';
      const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSet.call(input, q);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, CFG.searchQuery);
    recorder.fill('input[placeholder="Search in all projects…"]', CFG.searchQuery, 'Search');
    await page.waitForTimeout(CFG.waits.action);
    console.log("  ✅ Search entered\n");

    console.log("🔗 STEP 3: Opening first project...");
    await page.waitForSelector('td a[href^="/project/"]', { state: "visible", timeout: 5000 });
    await page.evaluate(() => { document.querySelector('td a[href^="/project/"]')?.click(); });
    recorder.click('td a[href^="/project/"]', 'Click first project');
    await page.waitForTimeout(CFG.waits.editor);
    console.log(`  ✅ Opened: ${page.url()}\n`);

    console.log("📝 STEP 4: Opening title dropdown...");
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Project title options"]');
      if (btn) btn.click();
    });
    recorder.click('button[aria-label="Project title options"]', 'Click title dropdown');
    await page.waitForTimeout(1000);

    console.log("📋 STEP 5: Clicking Make a copy...");
    await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const a of links) { if (a.textContent.trim() === 'Make a copy') { a.click(); return; } }
    });
    recorder.click('a:has-text("Make a copy")', 'Click Make a copy');
    await page.waitForTimeout(CFG.waits.dialog);
    console.log("  ✅ Copy dialog opened\n");

    console.log(`📝 STEP 6: Entering copy name "${CFG.copyName}"...`);
    await page.waitForSelector('[role="dialog"]', { state: "visible", timeout: 5000 });
    await page.evaluate((name) => {
      const dialog = document.querySelector('[role="dialog"]');
      const input = dialog.querySelector('input[type="text"]');
      if (input) {
        input.focus(); input.select();
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, name);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, CFG.copyName);
    recorder.fill('[role="dialog"] input[type="text"]', CFG.copyName, 'Type copy name');
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const btns = dialog.querySelectorAll('button');
      for (const btn of btns) { if (btn.textContent.trim() === 'Copy') { btn.click(); return; } }
    });
    recorder.click('button:has-text("Copy")', 'Click Copy');
    await page.waitForTimeout(5000);
    console.log(`  ✅ Copied. URL: ${page.url()}\n`);

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Project copied");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "overleaf_copy_project.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "overleaf_copy_project.py"), genPython(CFG, recorder), "utf-8");
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
