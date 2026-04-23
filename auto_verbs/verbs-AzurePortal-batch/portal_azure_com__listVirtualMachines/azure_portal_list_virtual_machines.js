const fs = require("fs");
const path = require("path");

/**
 * Azure Portal – List Virtual Machines
 *
 * Generates the Python Playwright script that navigates to Azure Portal,
 * opens the Virtual machines blade, and extracts a list of VMs.
 */

function genPython() {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
Azure Portal – List Virtual Machines

Navigates to Azure Portal > Virtual machines and extracts a list of VMs
with name, resource group, location, and status.

Generated on: ${ts}

Uses the user's Chrome profile for persistent login state.
"""

import os
from dataclasses import dataclass, field
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


def _azure_search_and_click(page: Page, service_name: str) -> None:
    """Use the top search bar to find and click a service."""
    search_box = None
    for selector in [
        'input[role="searchbox"]',
        'input[aria-label*="Search resources"]',
        'input[aria-label*="Search"]',
        '#portal-search-input',
    ]:
        loc = page.locator(selector).first
        if loc.count() > 0 and loc.is_visible(timeout=2000):
            search_box = loc
            break
    if search_box is None:
        search_trigger = page.locator(
            'button[aria-label*="Search"], [role="search"], #portal-search'
        ).first
        search_trigger.click()
        page.wait_for_timeout(1500)
        search_box = page.locator(
            'input[role="searchbox"], input[aria-label*="Search"]'
        ).first
    search_box.click()
    page.wait_for_timeout(500)
    search_box.press("Control+a")
    search_box.type(service_name, delay=30)
    page.wait_for_timeout(2000)
    for sel in [
        f'a:has-text("{service_name}")',
        f'[role="listbox"] [role="option"]:has-text("{service_name}")',
        f'[role="list"] [role="listitem"]:has-text("{service_name}")',
        f'li:has-text("{service_name}")',
    ]:
        loc = page.locator(sel).first
        try:
            if loc.count() > 0 and loc.is_visible(timeout=3000):
                loc.click()
                page.wait_for_timeout(2000)
                return
        except Exception:
            continue
    search_box.press("Enter")
    page.wait_for_timeout(3000)


@dataclass(frozen=True)
class VirtualMachineInfo:
    name: str
    resource_group: str
    location: str
    status: str


@dataclass(frozen=True)
class AzurePortalListVirtualMachinesRequest:
    max_results: int


@dataclass(frozen=True)
class AzurePortalListVirtualMachinesResult:
    success: bool
    virtual_machines: tuple  # tuple of VirtualMachineInfo
    error: str


# Navigates to Azure Portal > Virtual machines and extracts the list of VMs.
def azure_portal_list_virtual_machines(
    page: Page,
    request: AzurePortalListVirtualMachinesRequest,
) -> AzurePortalListVirtualMachinesResult:

    try:
        # ── STEP 1: Navigate to Azure Portal ─────────────────────────
        print("STEP 1: Navigating to Azure Portal...")
        checkpoint("Navigate to Azure Portal")
        _azure_portal_login(page)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Search for Virtual machines ──────────────────────
        print("STEP 2: Searching for Virtual machines...")
        checkpoint("Search Virtual machines")
        _azure_search_and_click(page, "Virtual machines")
        page.wait_for_timeout(5000)
        print(f"  Opened Virtual machines: {page.url}")

        # ── STEP 3: Wait for VM list to load ─────────────────────────
        print("STEP 3: Waiting for VM list to load...")
        checkpoint("Wait for VM list")
        page.wait_for_timeout(5000)

        # ── STEP 4: Extract VM data from the table ───────────────────
        print("STEP 4: Extracting VM list...")
        checkpoint("Extract VM list")
        vms = []

        # Azure Portal renders a grid/table for the VM list
        rows = page.locator(
            '[role="grid"] [role="row"], '
            'table tbody tr, '
            '[data-automationid="DetailsRow"]'
        ).all()

        for row in rows[:request.max_results]:
            try:
                cells = row.locator('[role="gridcell"], td').all()
                if len(cells) < 3:
                    continue
                # Typical column order: checkbox, Name, Resource group, Location, Status, ...
                name = ""
                resource_group = ""
                location = ""
                status = ""
                for i, cell in enumerate(cells):
                    text = cell.inner_text(timeout=1000).strip()
                    if i == 1 or (i == 0 and len(cells) < 5):
                        name = text
                    elif i == 2:
                        resource_group = text
                    elif i == 3:
                        location = text
                    elif i == 4:
                        status = text
                if name:
                    vms.append(VirtualMachineInfo(
                        name=name,
                        resource_group=resource_group,
                        location=location,
                        status=status,
                    ))
            except Exception:
                continue

        # Fallback: if no rows extracted, try text-based extraction
        if not vms:
            try:
                body_text = page.locator('[role="grid"], table, [class*="list"]').first.inner_text(timeout=5000)
                lines = [l.strip() for l in body_text.split("\\n") if l.strip()]
                print(f"  Fallback: extracted {len(lines)} text lines from list area")
            except Exception:
                pass

        print(f"  Found {len(vms)} VMs.")

        print(f"\\nSuccess! Listed {len(vms)} virtual machines.")
        return AzurePortalListVirtualMachinesResult(
            success=True,
            virtual_machines=tuple(vms),
            error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return AzurePortalListVirtualMachinesResult(
            success=False,
            virtual_machines=(),
            error=str(e),
        )


def test_azure_portal_list_virtual_machines() -> None:
    print("=" * 60)
    print("  Azure Portal – List Virtual Machines")
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
            request = AzurePortalListVirtualMachinesRequest(
                max_results=10,
            )
            result = azure_portal_list_virtual_machines(page, request)
            if result.success:
                print(f"\\n  SUCCESS: {len(result.virtual_machines)} VMs found")
                for vm in result.virtual_machines:
                    print(f"    - {vm.name} | {vm.resource_group} | {vm.location} | {vm.status}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_azure_portal_list_virtual_machines)
`;
}

// ── Main: write the Python file ──────────────────────────────────────────────
const pyCode = genPython();
const pyPath = path.join(__dirname, "azure_portal_list_virtual_machines.py");
fs.writeFileSync(pyPath, pyCode, "utf-8");
console.log(`✅  Wrote ${pyPath}  (${pyCode.length} chars)`);
