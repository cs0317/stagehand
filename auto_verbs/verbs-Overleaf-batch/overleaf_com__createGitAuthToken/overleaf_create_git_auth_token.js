const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Overleaf – Create Git Authentication Token
 *
 * Navigates to the Overleaf account settings page, finds the Git
 * authentication tokens section, clicks Generate/Add token, captures
 * the generated token from the dialog, and closes it.
 *
 * Uses the user's Chrome profile for persistent login state.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.overleaf.com/user/settings",
  waits: { page: 5000, action: 2000, dialog: 3000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Overleaf – Create Git Authentication Token

Navigates to the Overleaf account settings page, generates a new Git
authentication token, captures it from the dialog, and closes the dialog.

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
class OverleafCreateGitAuthTokenResult:
    success: bool
    token: str
    error: str


# Navigates to the Overleaf account settings page, generates a new
# Git authentication token, retrieves the token string from the popup
# dialog, and closes the dialog.
def overleaf_create_git_auth_token(
    page: Page,
) -> OverleafCreateGitAuthTokenResult:

    try:
        # ── STEP 1: Navigate to Overleaf account settings ────────────
        print("STEP 1: Loading Overleaf account settings page...")
        checkpoint("Navigate to account settings")
        page.goto(
            "${cfg.url}",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Scroll to Git authentication tokens section ──────
        print("STEP 2: Locating Git authentication tokens section...")
        git_heading = page.locator('h4:has-text("Your Git authentication tokens")')
        git_heading.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)
        checkpoint("Found Git authentication tokens section")
        print("  Found section.")

        # ── STEP 3: Click Generate token / Add another token ─────────
        print("STEP 3: Clicking token generation button...")
        # Two possible states:
        #   (a) No tokens yet → button#generate-token-button "Generate token"
        #   (b) Tokens exist  → button.btn-inline-link "Add another token"
        gen_btn = page.locator('button#generate-token-button')
        add_btn = page.locator('button:has-text("Add another token")')

        if gen_btn.count() > 0 and gen_btn.is_visible():
            checkpoint("Click Generate token button")
            gen_btn.click()
            print('  Clicked "Generate token".')
        elif add_btn.count() > 0 and add_btn.is_visible():
            checkpoint("Click Add another token button")
            add_btn.click()
            print('  Clicked "Add another token".')
        else:
            return OverleafCreateGitAuthTokenResult(
                success=False,
                token="",
                error="Could not find Generate token or Add another token button",
            )
        page.wait_for_timeout(2000)

        # ── STEP 4: Extract token from dialog ────────────────────────
        print("STEP 4: Extracting token from dialog...")
        dialog = page.locator('[role="dialog"]')
        dialog.wait_for(state="visible", timeout=10000)

        # The token is inside: span[aria-label="Git authentication token"] > code
        token_code = dialog.locator(
            'span[aria-label="Git authentication token"] code'
        )
        token_code.wait_for(state="visible", timeout=5000)
        token = token_code.inner_text(timeout=3000).strip()
        checkpoint(f"Token retrieved: {token[:8]}...")
        print(f"  Token: {token}")

        # ── STEP 5: Close the dialog ─────────────────────────────────
        print("STEP 5: Closing dialog...")
        close_btn = dialog.locator('.modal-footer button:has-text("Close")')
        checkpoint("Click Close button")
        close_btn.click()
        page.wait_for_timeout(1000)
        print("  Dialog closed.")

        print(f"\\nSuccess! Token generated: {token[:8]}...")
        return OverleafCreateGitAuthTokenResult(
            success=True,
            token=token,
            error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return OverleafCreateGitAuthTokenResult(
            success=False,
            token="",
            error=str(e),
        )


def test_overleaf_create_git_auth_token() -> None:
    print("=" * 60)
    print("  Overleaf – Create Git Authentication Token")
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
            result = overleaf_create_git_auth_token(page)
            if result.success:
                print(f"\\n  SUCCESS: Token = {result.token}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_overleaf_create_git_auth_token)
`;
}


// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Overleaf – Create Git Authentication Token");
  console.log("  AI-driven exploration + concrete Playwright locators");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    console.log("🎭 Initializing Stagehand...");
    stagehand = new Stagehand({
      env: "LOCAL",
      verbose: 0,
      llmClient,
      localBrowserLaunchOptions: {
        userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"),
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-infobars",
          "--disable-extensions",
          "--start-maximized",
          "--window-size=1920,1080",
        ],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    // ── STEP 1: Navigate to settings ────────────────────────────────
    console.log("🌐 STEP 1: Loading Overleaf account settings...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    recorder.wait(CFG.waits.page, "Wait for settings page to load");
    await page.waitForTimeout(CFG.waits.page);
    console.log(`  ✅ Loaded: ${page.url()}\n`);

    // ── STEP 2: Find Git authentication tokens section ──────────────
    console.log("🔍 STEP 2: Locating Git authentication tokens section...");
    // Scroll to the Git auth section using evaluate
    await page.evaluate(() => {
      const headings = document.querySelectorAll('h4');
      for (const h of headings) {
        if (h.innerText.toLowerCase().includes('git authentication')) {
          h.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
    });
    await page.waitForTimeout(1000);
    console.log("  ✅ Found section\n");

    // ── STEP 3: Click Generate token / Add another token ────────────
    console.log("🔘 STEP 3: Clicking token generation button...");
    const clickedBtn = await page.evaluate(() => {
      // Try "Generate token" button first
      const genBtn = document.querySelector('button#generate-token-button');
      if (genBtn) { genBtn.click(); return 'generate'; }
      // Try "Add another token" button
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent.trim() === 'Add another token') {
          btn.click();
          return 'add-another';
        }
      }
      return null;
    });
    if (!clickedBtn) {
      throw new Error("Could not find Generate token or Add another token button");
    }
    recorder.click(clickedBtn === 'generate' ? 'button#generate-token-button' : 'button:has-text("Add another token")', `Click ${clickedBtn}`);
    console.log(`  ✅ Clicked "${clickedBtn}" button`);
    await page.waitForTimeout(CFG.waits.dialog);

    // ── STEP 4: Extract token from dialog ───────────────────────────
    console.log("\n🔑 STEP 4: Extracting token from dialog...");
    await page.waitForSelector('[role="dialog"]', { state: "visible", timeout: 10000 });
    await page.waitForSelector('span[aria-label="Git authentication token"] code', { state: "visible", timeout: 5000 });
    const token = await page.evaluate(() => {
      const code = document.querySelector('span[aria-label="Git authentication token"] code');
      return code ? code.textContent.trim() : '';
    });
    if (!token) throw new Error("Could not extract token from dialog");
    recorder.extractText('span[aria-label="Git authentication token"] code', 'token', 'Extract generated token');
    console.log(`  ✅ Token: ${token}`);

    // ── STEP 5: Close dialog ────────────────────────────────────────
    console.log("\n📋 STEP 5: Closing dialog...");
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const footer = dialog.querySelector('.modal-footer');
      const closeBtn = footer.querySelector('button');
      if (closeBtn) closeBtn.click();
    });
    recorder.click('.modal-footer button:has-text("Close")', 'Click Close');
    await page.waitForTimeout(1000);
    console.log("  ✅ Dialog closed");

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — Token generated: ${token.substring(0, 8)}...`);
    console.log("═══════════════════════════════════════════════════════════");

    // ── Save Python + JSON ──────────────────────────────────────────
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "overleaf_create_git_auth_token.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "overleaf_create_git_auth_token.py"), pyScript, "utf-8");
      console.log("⚠️  Partial Python saved");
    }
    throw err;
  } finally {
    if (stagehand) {
      console.log("🧹 Closing...");
      await stagehand.close();
    }
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
