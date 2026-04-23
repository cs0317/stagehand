const fs = require("fs");
const path = require("path");

/**
 * Azure Portal – View Activity Log
 *
 * Generates the Python Playwright script that navigates to Azure Portal,
 * opens Monitor > Activity log, and extracts recent entries.
 */

function genPython() {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
Azure Portal – View Activity Log

Navigates to Azure Portal > Monitor > Activity log and extracts recent
activity log entries (operation name, status, time, resource).

Generated on: ${ts}

Uses the user's Chrome profile for persistent login state.
"""

import os
from dataclasses import dataclass
from typing import List
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint


def _azure_portal_login(page: Page) -> None:
    """Navigate to Azure Portal and handle the 'Pick an account' page if needed."""
    page.goto("https://portal.azure.com/", wait_until="domcontentloaded", timeout=60000)
    for _ in range(30):
        page.wait_for_timeout(2000)
        current_url = page.url
        if "portal.azure.com" in current_url and "login" not in current_url and "oauth" not in current_url:
            return
        if "login.microsoftonline.com" in current_url:
            try:
                account_tile = page.locator(
                    '[data-test-id="list-item-0"], '
                    '.table[role="presentation"] .row, '
                    '#tilesHolder .tile-container'
                ).first
                if account_tile.count() > 0 and account_tile.is_visible(timeout=2000):
                    print("  Found 'Pick an account' page, clicking first account...")
                    account_tile.click()
                    page.wait_for_timeout(3000)
            except Exception:
                pass
    page.wait_for_timeout(3000)


@dataclass(frozen=True)
class ActivityLogEntry:
    operation_name: str
    status: str
    time: str
    resource: str


@dataclass(frozen=True)
class AzurePortalViewActivityLogRequest:
    max_entries: int


@dataclass(frozen=True)
class AzurePortalViewActivityLogResult:
    success: bool
    entries: tuple  # tuple of ActivityLogEntry
    error: str


# Navigates to Azure Portal > Monitor > Activity log and extracts recent entries.
def azure_portal_view_activity_log(
    page: Page,
    request: AzurePortalViewActivityLogRequest,
) -> AzurePortalViewActivityLogResult:

    try:
        # ── STEP 1: Navigate to Azure Portal ─────────────────────────
        print("STEP 1: Navigating to Azure Portal...")
        checkpoint("Navigate to Azure Portal")
        _azure_portal_login(page)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Navigate to Activity log ─────────────────────────
        print("STEP 2: Navigating to Activity log...")
        checkpoint("Navigate to Activity log")
        page.goto(
            "https://portal.azure.com/#blade/Microsoft_Azure_ActivityLog/ActivityLogBlade",
            wait_until="domcontentloaded",
            timeout=60000,
        )
        page.wait_for_timeout(15000)
        print(f"  Loaded: {page.url}")

        # ── STEP 3: Extract activity log entries ─────────────────────
        print("STEP 3: Extracting activity log entries...")
        checkpoint("Extract entries")
        entries = []

        # The activity log grid is in the main page with aria-label="Activity log grid"
        grid = page.locator('[role="grid"][aria-label="Activity log grid"]').first
        try:
            grid.wait_for(state="visible", timeout=10000)
        except Exception:
            # Fallback: try any grid in reactblade iframes
            for f in page.frames:
                if "reactblade" in f.url and "portal.azure" in f.url:
                    g = f.locator('[role="grid"]').first
                    try:
                        if g.count() > 0 and g.is_visible(timeout=3000):
                            grid = g
                            break
                    except:
                        pass

        rows = grid.locator('[role="row"]').all()
        # Skip header row (row[0])
        for row in rows[1:request.max_entries + 1]:
            try:
                cells = row.locator('[role="gridcell"]').all()
                if len(cells) < 3:
                    continue
                # Columns: Operation name, Status, Time, Time stamp, Subscription, Event initiated by
                operation_name = cells[0].inner_text(timeout=1000).strip()
                status = cells[1].inner_text(timeout=1000).strip()
                time_str = cells[2].inner_text(timeout=1000).strip()
                resource = cells[3].inner_text(timeout=1000).strip() if len(cells) > 3 else ""
                if operation_name:
                    entries.append(ActivityLogEntry(
                        operation_name=operation_name,
                        status=status,
                        time=time_str,
                        resource=resource,
                    ))
            except Exception:
                continue

        print(f"  Found {len(entries)} activity log entries.")

        print(f"\\nSuccess! Extracted {len(entries)} activity log entries.")
        return AzurePortalViewActivityLogResult(
            success=True,
            entries=tuple(entries),
            error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return AzurePortalViewActivityLogResult(
            success=False,
            entries=(),
            error=str(e),
        )


def test_azure_portal_view_activity_log() -> None:
    print("=" * 60)
    print("  Azure Portal – View Activity Log")
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
            request = AzurePortalViewActivityLogRequest(
                max_entries=10,
            )
            result = azure_portal_view_activity_log(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {len(result.entries)} entries")
                for entry in result.entries:
                    print(f"    - {entry.operation_name} | {entry.status} | {entry.time} | {entry.resource}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_azure_portal_view_activity_log)
`;
}

// ── Main: write the Python file ──────────────────────────────────────────────
const pyCode = genPython();
const pyPath = path.join(__dirname, "azure_portal_view_activity_log.py");
fs.writeFileSync(pyPath, pyCode, "utf-8");
console.log(`✅  Wrote ${pyPath}  (${pyCode.length} chars)`);
