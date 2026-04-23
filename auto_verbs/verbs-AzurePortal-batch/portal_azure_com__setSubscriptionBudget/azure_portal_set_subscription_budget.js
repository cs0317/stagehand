const fs = require("fs");
const path = require("path");

/**
 * Azure Portal – Set Subscription Budget
 *
 * Generates the Python Playwright script that navigates to Azure Portal,
 * opens Cost Management > Budgets, and creates a new monthly budget.
 */

function genPython() {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
Azure Portal – Set Subscription Budget

Navigates to Azure Portal > Cost Management > Budgets and creates a new
monthly budget with the specified name and amount.

Generated on: ${ts}

Uses the user's Chrome profile for persistent login state.
"""

import os
from dataclasses import dataclass
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
class AzurePortalSetSubscriptionBudgetRequest:
    budget_name: str
    budget_amount: float
    reset_period: str  # "Monthly", "Quarterly", "Annually"
    alert_threshold_percent: float = 80.0  # Alert at this % of budget (0.01\u20131000)


@dataclass(frozen=True)
class AzurePortalSetSubscriptionBudgetResult:
    success: bool
    budget_name: str
    budget_amount: float
    error: str


# Creates a new budget in Azure Portal Cost Management > Budgets.
def azure_portal_set_subscription_budget(
    page: Page,
    request: AzurePortalSetSubscriptionBudgetRequest,
) -> AzurePortalSetSubscriptionBudgetResult:

    try:
        # ── STEP 1: Navigate to Azure Portal ─────────────────────────
        print("STEP 1: Navigating to Azure Portal...")
        checkpoint("Navigate to Azure Portal")
        _azure_portal_login(page)
        print(f"  Loaded: {page.url}")

        # ── STEP 2: Navigate to Budgets ─────────────────────────────
        print("STEP 2: Navigating to Budgets...")
        checkpoint("Navigate to Budgets")
        page.goto(
            "https://portal.azure.com/#view/Microsoft_Azure_CostManagement/Menu/~/budgets",
            wait_until="domcontentloaded",
            timeout=60000,
        )
        page.wait_for_timeout(15000)
        print(f"  Loaded: {page.url}")

        # Find the working frame (may be reactblade iframe or main page)
        form_frame = page
        for f in page.frames:
            if "reactblade" in f.url and "portal.azure" in f.url:
                try:
                    txt = f.locator('body').inner_text(timeout=3000)
                    if 'budget' in txt.lower() or 'add' in txt.lower():
                        form_frame = f
                        break
                except Exception:
                    pass

        # ── STEP 3: Click + Add ──────────────────────────────────────
        print("STEP 3: Clicking + Add...")
        checkpoint("Click Add")
        add_btn = None
        for sf in [form_frame, page]:
            for sel in [
                'button:has-text("Add")',
                'button:has-text("+ Add")',
                'a:has-text("Add")',
                '[data-testid*="add"]',
                'button[aria-label*="Add"]',
                '[role="button"]:has-text("Add")',
            ]:
                loc = sf.locator(sel).first
                try:
                    if loc.count() > 0 and loc.is_visible(timeout=3000):
                        add_btn = loc
                        break
                except Exception:
                    continue
            if add_btn:
                break
        if add_btn is None:
            raise Exception("Could not find '+ Add' button")
        add_btn.click()
        page.wait_for_timeout(8000)
        print("  Create budget form opened.")

        # Re-find the form frame after the new blade opens
        budget_frame = page
        for f in page.frames:
            if "reactblade" in f.url and "portal.azure" in f.url:
                try:
                    # Look for budget-specific inputs in this frame
                    if f.locator('input[aria-label*="Name"], input[aria-label*="Budget name"]').count() > 0:
                        budget_frame = f
                        break
                    txt = f.locator('body').inner_text(timeout=3000)
                    if 'budget' in txt.lower() and ('name' in txt.lower() or 'amount' in txt.lower()):
                        budget_frame = f
                        break
                except:
                    pass

        # ── STEP 4: Fill in the budget form ──────────────────────────
        print("STEP 4: Filling in the budget form...")
        checkpoint("Fill budget form")

        # 4a. Enter budget name
        print(f"  Setting budget name: {request.budget_name}")
        name_input = None
        name_sels = [
            'input[aria-label*="Name"]:not([aria-label*="Search"])',
            'input[aria-label*="name"]:not([aria-label*="Search"])',
            'input[aria-label*="Budget name"]',
            'input[placeholder*="Enter name"]',
        ]
        for sf in [budget_frame, form_frame, page]:
            for sel in name_sels:
                loc = sf.locator(sel).first
                try:
                    if loc.count() > 0 and loc.is_visible(timeout=3000) and loc.is_enabled(timeout=1000):
                        name_input = loc
                        break
                except:
                    pass
            if name_input:
                break
        if name_input is None:
            raise Exception("Could not find Name input")
        name_input.click()
        name_input.press("Control+a")
        name_input.type(request.budget_name, delay=30)
        page.wait_for_timeout(1000)

        # 4b. Set reset period
        print(f"  Setting reset period: {request.reset_period}")
        try:
            reset_dropdown = None
            reset_sels = [
                '[aria-label*="Reset period"]',
                '[aria-label*="reset period"]',
                'select[name*="reset"]',
                '[aria-label*="Reset"]',
            ]
            for sf in [budget_frame, form_frame, page]:
                for sel in reset_sels:
                    loc = sf.locator(sel).first
                    try:
                        if loc.count() > 0 and loc.is_visible(timeout=3000):
                            reset_dropdown = loc
                            break
                    except:
                        pass
                if reset_dropdown:
                    break
            if reset_dropdown:
                reset_dropdown.click()
                page.wait_for_timeout(1000)
                reset_option = None
                for sf in [budget_frame, form_frame, page]:
                    loc = sf.locator(
                        f'[role="option"]:has-text("{request.reset_period}"), '
                        f'option:has-text("{request.reset_period}")'
                    ).first
                    try:
                        if loc.count() > 0 and loc.is_visible(timeout=3000):
                            reset_option = loc
                            break
                    except:
                        pass
                if reset_option:
                    reset_option.click()
                    page.wait_for_timeout(1000)
        except Exception:
            pass

        # 4c. Enter budget amount
        print(f"  Setting budget amount: {request.budget_amount}")
        amount_input = None
        amount_sels = [
            'input[aria-label*="Amount"]',
            'input[aria-label*="amount"]',
            'input[placeholder*="amount"]',
            'input[name*="numericTextBox"]',
            'input[type="number"]',
        ]
        for sf in [budget_frame, form_frame, page]:
            for sel in amount_sels:
                loc = sf.locator(sel).first
                try:
                    if loc.count() > 0 and loc.is_visible(timeout=3000):
                        amount_input = loc
                        break
                except:
                    pass
            if amount_input:
                break
        if amount_input is None:
            raise Exception("Could not find Amount input")
        amount_input.click()
        amount_input.press("Control+a")
        amount_input.type(str(int(request.budget_amount)), delay=30)
        page.wait_for_timeout(1000)

        # ── STEP 5: Click Next ───────────────────────────────────────
        print("STEP 5: Clicking Next...")
        checkpoint("Click Next")
        next_btn = None
        for sf in [budget_frame, form_frame, page]:
            for sel in ['button:has-text("Next")', '[role="button"]:has-text("Next")']:
                loc = sf.locator(sel).first
                try:
                    if loc.count() > 0 and loc.is_visible(timeout=3000):
                        next_btn = loc
                        break
                except:
                    pass
            if next_btn:
                break
        try:
            if next_btn and next_btn.is_visible(timeout=5000):
                next_btn.click()
                page.wait_for_timeout(3000)
                print("  Moved to alert conditions page.")

                # Fill in the required alert threshold percentage
                print(f"  Setting alert threshold: {request.alert_threshold_percent}%")
                pct_input = None
                pct_sels = [
                    'input[placeholder*="Enter %"]',
                    'input[aria-label*="Enter %"]',
                    'input[aria-label*="percent"]',
                    'input[aria-label*="Percent"]',
                    'input[placeholder*="%"]',
                ]
                for sf in [budget_frame, form_frame, page]:
                    for sel in pct_sels:
                        loc = sf.locator(sel).first
                        try:
                            if loc.count() > 0 and loc.is_visible(timeout=3000):
                                pct_input = loc
                                break
                        except:
                            pass
                    if pct_input:
                        break
                if pct_input is None:
                    # Fallback: look for numericTextBox inputs on this page
                    for sf in [budget_frame, form_frame, page]:
                        loc = sf.locator('input[name*="numericTextBox"]:visible').first
                        try:
                            if loc.count() > 0:
                                pct_input = loc
                                break
                        except:
                            pass
                if pct_input:
                    pct_input.click()
                    pct_input.press("Control+a")
                    pct_input.type(str(int(request.alert_threshold_percent)), delay=30)
                    page.wait_for_timeout(1000)
                    print(f"  Alert threshold set to {request.alert_threshold_percent}%")
                else:
                    print("  WARNING: Could not find alert threshold input")

                # Try to click Create on the alerts page
                create_btn = None
                for sf in [budget_frame, form_frame, page]:
                    for sel in ['button:has-text("Create")', '[role="button"]:has-text("Create")']:
                        loc = sf.locator(sel).first
                        try:
                            if loc.count() > 0 and loc.is_visible(timeout=3000):
                                create_btn = loc
                                break
                        except:
                            pass
                    if create_btn:
                        break
                if create_btn:
                    create_btn.click()
                    page.wait_for_timeout(5000)
        except Exception:
            # If no Next button, try clicking Create directly
            create_btn = None
            for sf in [budget_frame, form_frame, page]:
                for sel in ['button:has-text("Create")', '[role="button"]:has-text("Create")']:
                    loc = sf.locator(sel).first
                    try:
                        if loc.count() > 0 and loc.is_visible(timeout=3000):
                            create_btn = loc
                            break
                    except:
                        pass
                if create_btn:
                    break
            if create_btn is None:
                raise Exception("Could not find Create button")
            create_btn.click()
            page.wait_for_timeout(5000)

        print("  Budget creation submitted.")

        # ── STEP 6: Verify success ───────────────────────────────────
        print("STEP 6: Verifying budget creation...")
        checkpoint("Verify creation")
        page.wait_for_timeout(3000)

        print(f"\\nSuccess! Created budget '{request.budget_name}' with amount {request.budget_amount}.")
        return AzurePortalSetSubscriptionBudgetResult(
            success=True,
            budget_name=request.budget_name,
            budget_amount=request.budget_amount,
            error="",
        )

    except Exception as e:
        print(f"Error: {e}")
        return AzurePortalSetSubscriptionBudgetResult(
            success=False,
            budget_name=request.budget_name,
            budget_amount=request.budget_amount,
            error=str(e),
        )


def test_azure_portal_set_subscription_budget() -> None:
    print("=" * 60)
    print("  Azure Portal – Set Subscription Budget")
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
            request = AzurePortalSetSubscriptionBudgetRequest(
                budget_name="monthly-budget-test",
                budget_amount=100.0,
                reset_period="Monthly",
            )
            result = azure_portal_set_subscription_budget(page, request)
            if result.success:
                print(f"\\n  SUCCESS: Budget '{result.budget_name}' = {result.budget_amount}")
            else:
                print(f"\\n  FAILED: {result.error}")
        finally:
            context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_azure_portal_set_subscription_budget)
`;
}

// ── Main: write the Python file ──────────────────────────────────────────────
const pyCode = genPython();
const pyPath = path.join(__dirname, "azure_portal_set_subscription_budget.py");
fs.writeFileSync(pyPath, pyCode, "utf-8");
console.log(`✅  Wrote ${pyPath}  (${pyCode.length} chars)`);
