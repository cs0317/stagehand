const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Overleaf – Compile and Download PDF
 *
 * Navigates to a project by ID, clicks Recompile, waits for compilation,
 * then clicks Download PDF.
 */

const CFG = {
  projectId: "69e6b0a3d05bcdbdf251587c",
  waits: { page: 5000, action: 2000, editor: 8000, compile: 15000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Overleaf – Compile and Download PDF

Navigates to a project by ID, recompiles it, and downloads
the resulting PDF.

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
from overleaf_helpers import ensure_test_project_exists


@dataclass(frozen=True)
class OverleafCompileAndDownloadPDFRequest:
    project_id: str
    download_dir: str


@dataclass(frozen=True)
class OverleafCompileAndDownloadPDFResult:
    success: bool
    pdf_file_path: str
    error: str


# Navigates to a project by ID, recompiles, and downloads the PDF.
def overleaf_compile_and_download_pdf(
    page: Page,
    request: OverleafCompileAndDownloadPDFRequest,
) -> OverleafCompileAndDownloadPDFResult:

    try:
        # ── STEP 1: Navigate to project editor ──────────────────────
        print("STEP 1: Loading project editor...")
        checkpoint("Navigate to project editor")
        page.goto(
            f"https://www.overleaf.com/project/{request.project_id}",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Click Recompile button ───────────────────────────
        print("STEP 2: Clicking Recompile...")
        recompile_btn = page.locator('button:has-text("Recompile")').first
        if recompile_btn.count() == 0:
            recompile_btn = page.locator('button[aria-label="Recompile"]').first
        checkpoint("Click Recompile button")
        recompile_btn.click()
        page.wait_for_timeout(15000)
        print("  Compilation complete.")

        # ── STEP 3: Click the download dropdown arrow ────────────────
        print("STEP 3: Clicking download dropdown...")
        # Look for the small dropdown arrow next to the Recompile button
        dropdown_btn = page.locator(
            'button[aria-label="Toggle output files menu"]'
        ).first
        if dropdown_btn.count() == 0:
            dropdown_btn = page.locator(
                '.pdf-toolbar button:has-text("arrow_drop_down")'
            ).first
        if dropdown_btn.count() > 0:
            checkpoint("Click download dropdown")
            dropdown_btn.click()
            page.wait_for_timeout(1000)

        # ── STEP 4: Click Download PDF ───────────────────────────────
        print("STEP 4: Clicking Download PDF...")
        download_pdf = page.locator('a:has-text("Download PDF")').first
        if download_pdf.count() == 0:
            download_pdf = page.locator(
                'button:has-text("Download PDF")'
            ).first
        checkpoint("Click Download PDF")
        with page.expect_download() as download_info:
            download_pdf.click()
        download = download_info.value
        pdf_path = os.path.join(
            request.download_dir, download.suggested_filename,
        )
        download.save_as(pdf_path)
        page.wait_for_timeout(2000)
        print(f"  Downloaded: {pdf_path}")

        print(f"\\nSuccess! PDF downloaded: {pdf_path}")
        return OverleafCompileAndDownloadPDFResult(
            success=True, pdf_file_path=pdf_path, error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return OverleafCompileAndDownloadPDFResult(
            success=False, pdf_file_path="", error=str(e),
        )


def test_overleaf_compile_and_download_pdf() -> None:
    print("=" * 60)
    print("  Overleaf – Compile and Download PDF")
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
            project_id = ensure_test_project_exists(page, "My Paper 1")
            request = OverleafCompileAndDownloadPDFRequest(
                project_id=project_id,
                download_dir=os.path.join(os.environ["USERPROFILE"], "Downloads"),
            )
            result = overleaf_compile_and_download_pdf(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {result.pdf_file_path}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_overleaf_compile_and_download_pdf)
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Overleaf – Compile and Download PDF");
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
    const projectUrl = `https://www.overleaf.com/project/${CFG.projectId}`;

    console.log("🌐 STEP 1: Loading project editor...");
    recorder.goto(projectUrl);
    await page.goto(projectUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.editor);
    console.log(`  ✅ Loaded: ${page.url()}\n`);

    console.log("🔄 STEP 2: Clicking Recompile...");
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Recompile'));
      if (btn) btn.click();
    });
    recorder.click('button:has-text("Recompile")', 'Click Recompile');
    await page.waitForTimeout(CFG.waits.compile);
    console.log("  ✅ Compilation complete\n");

    console.log("📥 STEP 3: Opening download dropdown...");
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Toggle output files menu"]') ||
                  Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('arrow_drop_down'));
      if (btn) btn.click();
    });
    recorder.click('button[aria-label="Toggle output files menu"]', 'Toggle dropdown');
    await page.waitForTimeout(1000);

    console.log("📄 STEP 4: Clicking Download PDF...");
    await page.evaluate(() => {
      const links = document.querySelectorAll('a, button');
      for (const el of links) { if (el.textContent.includes('Download PDF')) { el.click(); return; } }
    });
    recorder.click('a:has-text("Download PDF")', 'Click Download PDF');
    await page.waitForTimeout(5000);
    console.log("  ✅ Download initiated\n");

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ DONE — PDF compiled and downloaded");
    console.log("═══════════════════════════════════════════════════════════");

    fs.writeFileSync(path.join(__dirname, "overleaf_compile_and_download_pdf.py"), genPython(CFG, recorder), "utf-8");
    console.log(`\n✅ Python saved`);
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "overleaf_compile_and_download_pdf.py"), genPython(CFG, recorder), "utf-8");
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
