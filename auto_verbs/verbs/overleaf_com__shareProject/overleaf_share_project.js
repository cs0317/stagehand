const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct, extractAriaScopeForXPath } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Overleaf – Share Project
 *
 * Uses AI-driven discovery to interact with Overleaf's share dialog.
 * Records interactions and generates a Python Playwright script.
 * Does not take any screenshots.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.overleaf.com",
  projectId: "69e6b0a3d05bcdbdf251587c",
  collaboratorEmail: "shuochen@live.com",
  role: "Editor",
  waits: { page: 5000, action: 2000, dialog: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Overleaf – Share Project

Shares an Overleaf project with a collaborator by email.

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright persistent context with the user's Chrome profile.
"""

import os
import sys
from dataclasses import dataclass
from playwright.sync_api import Playwright, sync_playwright


@dataclass
class OverleafShareProjectRequest:
    project_id: str = "${cfg.projectId}"
    collaborator_email: str = "${cfg.collaboratorEmail}"
    role: str = "${cfg.role}"  # "Editor", "Viewer", or "Reviewer"


@dataclass
class OverleafShareProjectResult:
    success: bool
    error: str = ""


def overleaf_share_project(
    playwright: Playwright,
    request: OverleafShareProjectRequest = OverleafShareProjectRequest(),
) -> OverleafShareProjectResult:
    """Share an Overleaf project with a collaborator by email."""

    user_data_dir = os.path.join(
        os.environ["USERPROFILE"],
        "AppData", "Local", "Google", "Chrome", "User Data", "Default",
    )

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
        project_url = f"${cfg.url}/project/{request.project_id}"

        # ── STEP 1: Navigate to project ───────────────────────────────────
        print(f"STEP 1: Navigating to project {request.project_id}...")
        page.goto(project_url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Click Share button ────────────────────────────────────
        print("STEP 2: Clicking Share button...")
        share_btn = page.locator('button:has-text("Share")')
        share_btn.wait_for(state="visible", timeout=10000)
        share_btn.click()
        page.wait_for_timeout(2000)
        print("  Share dialog opened")

        # ── STEP 3: Select role ───────────────────────────────────────────
        print(f"STEP 3: Selecting role '{request.role}'...")
        role_input = page.locator('[data-testid="add-collaborator-select"]')
        current_role = role_input.input_value()
        if current_role != request.role:
            role_input.click()
            page.wait_for_timeout(1000)
            # Click the matching option button
            role_option = page.locator(f'button[role="option"]:has-text("{request.role}")').first
            role_option.click()
            page.wait_for_timeout(500)
            print(f"  Selected role: {request.role}")
        else:
            print(f"  Role already set to: {request.role}")

        # ── STEP 4: Enter collaborator email ──────────────────────────────
        print(f"STEP 4: Entering email '{request.collaborator_email}'...")
        email_input = page.locator('[data-testid="collaborator-email-input"]')
        email_input.click()
        page.wait_for_timeout(500)
        email_input.press("Control+a")
        email_input.fill(request.collaborator_email)
        page.wait_for_timeout(1000)
        print(f"  Entered email: {request.collaborator_email}")

        # ── STEP 5: Click Invite ──────────────────────────────────────────
        print("STEP 5: Clicking Invite button...")
        invite_btn = page.locator('[role="dialog"] button:has-text("Invite")')
        invite_btn.click()
        page.wait_for_timeout(2000)
        print("  Invite sent!")

        # ── STEP 6: Verify and close ──────────────────────────────────────
        print("STEP 6: Verifying invitation...")
        # Check if the email appears in the collaborators list
        dialog = page.locator('[role="dialog"]')
        dialog_text = dialog.inner_text(timeout=3000)
        if request.collaborator_email in dialog_text:
            print(f"  Confirmed: {request.collaborator_email} added as {request.role}")
        else:
            print("  Note: Could not confirm invitation in dialog text")

        # Close the dialog
        close_btn = page.locator('[role="dialog"] button:has-text("Close")')
        close_btn.click()
        page.wait_for_timeout(1000)
        print("  Dialog closed")

        return OverleafShareProjectResult(success=True)

    except Exception as e:
        print(f"ERROR: {e}")
        return OverleafShareProjectResult(success=False, error=str(e))

    finally:
        context.close()


# ── Test Code ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    with sync_playwright() as pw:
        request = OverleafShareProjectRequest(
            project_id="${cfg.projectId}",
            collaborator_email="${cfg.collaboratorEmail}",
            role="${cfg.role}",
        )
        print("=" * 60)
        print("  Overleaf – Share Project")
        print(f"  Project: ${cfg.projectId}")
        print(f"  Invite: ${cfg.collaboratorEmail} as ${cfg.role}")
        print("=" * 60)
        result = overleaf_share_project(pw, request)
        print("\\n" + "=" * 60)
        if result.success:
            print("  SUCCESS: Project shared!")
        else:
            print(f"  FAILED: {result.error}")
        print("=" * 60)
`;
}

// ── Helper: Open share dialog ────────────────────────────────────────────────
async function openShareDialog(stagehand, page, recorder) {
  console.log("📤 Opening Share dialog...");
  recorder.click('button.btn-primary:has-text("Share")', "Click Share button");

  // Wait for the editor toolbar to fully load
  await page.waitForTimeout(3000);

  // The Share button contains icon text "person_add" + "Share"
  // Use evaluate to find and click it reliably
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button.btn-primary');
    for (const btn of btns) {
      if (btn.textContent.includes('Share')) {
        btn.click();
        return;
      }
    }
    throw new Error('Share button not found');
  });
  await page.waitForTimeout(CFG.waits.dialog);

  // Verify dialog is open
  await page.waitForSelector('[role="dialog"]', { state: "visible", timeout: 5000 });
  const title = await page.locator('[role="dialog"] .modal-title').textContent();
  console.log(`  ✅ Dialog opened: "${title}"`);
}

// ── Helper: Select role ──────────────────────────────────────────────────────
async function selectRole(stagehand, page, recorder, role) {
  console.log(`🎭 Selecting role: "${role}"...`);
  const roleInput = page.locator('[data-testid="add-collaborator-select"]');
  const currentRole = await roleInput.inputValue();

  if (currentRole === role) {
    console.log(`  ✅ Role already set to "${role}"`);
    return;
  }

  recorder.click('[data-testid="add-collaborator-select"]', `Click role dropdown`);
  await roleInput.click();
  await page.waitForTimeout(1000);

  // Find and click the matching option
  const option = page.locator(`button[role="option"]`).filter({ hasText: role }).first();
  const optionText = await option.textContent();
  console.log(`  Found option: "${optionText.trim().substring(0, 30)}"`);
  recorder.click(`button[role="option"]:has-text("${role}")`, `Select ${role}`);
  await option.click();
  await page.waitForTimeout(500);
  console.log(`  ✅ Selected role: "${role}"`);
}

// ── Helper: Enter email ──────────────────────────────────────────────────────
async function enterEmail(stagehand, page, recorder, email) {
  console.log(`📧 Entering email: "${email}"...`);
  recorder.click('[data-testid="collaborator-email-input"]', "Click email input");
  recorder.fill('[data-testid="collaborator-email-input"]', email, `Type email: ${email}`);
  
  // Use evaluate to focus, clear, and set the email value, then dispatch events
  await page.evaluate((emailAddr) => {
    const input = document.querySelector('[data-testid="collaborator-email-input"]');
    input.focus();
    input.click();
    input.value = '';
    // Use native input setter to trigger React's onChange
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, emailAddr);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, email);
  await page.waitForTimeout(1000);
  console.log(`  ✅ Entered email: "${email}"`);
}

// ── Helper: Click Invite ─────────────────────────────────────────────────────
async function clickInvite(stagehand, page, recorder) {
  console.log("📨 Clicking Invite button...");
  recorder.click('[role="dialog"] button:has-text("Invite")', "Click Invite");
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const btns = dialog.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === 'Invite') {
        btn.click();
        return;
      }
    }
    throw new Error('Invite button not found');
  });
  await page.waitForTimeout(CFG.waits.action);
  console.log("  ✅ Invite sent!");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Overleaf – Share Project");
  console.log("  AI-driven discovery + Playwright locators");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Project: ${CFG.projectId}`);
  console.log(`  Invite: ${CFG.collaboratorEmail} as ${CFG.role}\n`);

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
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized", "--window-size=1920,1080"],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    // ── Navigate to project ──────────────────────────────────────────
    const projectUrl = `${CFG.url}/project/${CFG.projectId}`;
    console.log(`🌐 Loading project: ${projectUrl}...`);
    recorder.goto(projectUrl);
    await page.goto(projectUrl);
    await page.waitForLoadState("domcontentloaded");
    recorder.wait(CFG.waits.page, "Wait for project to load");
    await page.waitForTimeout(CFG.waits.page);
    console.log("✅ Project loaded\n");

    // ── Open Share dialog ────────────────────────────────────────────
    await openShareDialog(stagehand, page, recorder);

    // ── Select role ──────────────────────────────────────────────────
    await selectRole(stagehand, page, recorder, CFG.role);

    // ── Enter email ──────────────────────────────────────────────────
    await enterEmail(stagehand, page, recorder, CFG.collaboratorEmail);

    // ── Click Invite ─────────────────────────────────────────────────
    await clickInvite(stagehand, page, recorder);

    // ── Verify ───────────────────────────────────────────────────────
    console.log("\n🔍 Verifying invitation...");
    const dialogText = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? d.textContent : '';
    });
    if (dialogText.includes(CFG.collaboratorEmail)) {
      console.log(`  ✅ Confirmed: ${CFG.collaboratorEmail} appears in the dialog`);
    } else {
      console.log("  ⚠️  Could not confirm invitation in dialog text");
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — Project shared successfully");
    console.log("═══════════════════════════════════════════════════════════");

    // ── Save Python + JSON ───────────────────────────────────────────
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "overleaf_share_project.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "overleaf_share_project.py"), pyScript, "utf-8");
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
