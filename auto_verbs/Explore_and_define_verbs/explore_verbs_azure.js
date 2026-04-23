const fs = require("fs");
const path = require("path");

/**
 * Azure Portal – Explore & Propose 10 New Verbs
 *
 * Generates prompt-create-trajectory.txt files for 10 Azure Portal verbs
 * in the verbs-AzurePortal-batch output folder.
 *
 * Key UI observations (from live exploration):
 * - Homepage: https://portal.azure.com/#home shows dashboard with recent resources
 * - Top search bar: search for services, resources, docs
 * - Left sidebar: collapsible menu with favorites and "All services"
 * - "Pick an account" page: on first load, may require clicking a Microsoft account tile
 *   (see portal_azure_com__openService/azure_portal_open_service.py for the login pattern:
 *    detect login.microsoftonline.com in URL, click [data-test-id="list-item-0"])
 * - Resource groups: containers for organizing Azure resources
 * - Cloud Shell: integrated terminal accessible from the top bar
 * - Notifications: bell icon in top bar shows deployment/operation status
 * - Cost Management: billing and cost analysis
 * - Activity Log: audit trail of operations
 * - Azure CLI / Cloud Shell: run commands in-browser
 */

// ── Login preamble (referenced in every verb) ────────────────────────────────
const LOGIN_PREAMBLE = `- Assume that the user has signed into Azure Portal (the test code should open the browser using the user's persistent profile. see auto_verbs\\common\\open_browser.py to learn how to do it.)
- Navigate to https://portal.azure.com/.
- The browser may redirect through a Microsoft login page ("Pick an account"). If this happens, click the first account tile to proceed. See auto_verbs\\verbs-AzurePortal-batch\\portal_azure_com__openService\\azure_portal_open_service.py for how to detect and handle this (look for login.microsoftonline.com in the URL, then click [data-test-id="list-item-0"]).
- Wait for the Azure Portal home page to fully load (URL contains portal.azure.com and does not contain "login" or "oauth").`;

// ── Verb definitions ─────────────────────────────────────────────────────────
const VERBS = [
  {
    folder: "portal_azure_com__createResourceGroup",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://portal.azure.com/

* Concrete task
${LOGIN_PREAMBLE}
- Use the top search bar to search for "Resource groups".
- Click the "Resource groups" service result.
- Click the "+ Create" button.
- In the "Create a resource group" form:
  - Select a subscription from the dropdown (use the first available one).
  - Enter a resource group name (e.g. "test-rg-001").
  - Select a region (e.g. "East US").
- Click "Review + create".
- On the validation page, click "Create".
- Wait for the deployment to complete.
- Return whether the task is successful. If so, return the resource group name.
`,
  },
  {
    folder: "portal_azure_com__createStorageAccount",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://portal.azure.com/

* Concrete task
${LOGIN_PREAMBLE}
- Use the top search bar to search for "Storage accounts".
- Click the "Storage accounts" service result.
- Click the "+ Create" button.
- In the "Create a storage account" form:
  - Select a subscription from the dropdown (use the first available one).
  - Select or create a resource group (e.g. "test-rg-001").
  - Enter a storage account name (e.g. "teststorage" followed by a random 5-digit number to ensure uniqueness). Storage account names must be 3-24 characters, lowercase letters and numbers only.
  - Select a region (e.g. "East US").
  - Leave other settings as defaults.
- Click "Review + create" (it may be at the bottom of the page, scroll down if needed).
- On the validation page, click "Create".
- Wait for the deployment to complete (may take 30-60 seconds; watch for "Your deployment is complete").
- Return whether the task is successful. If so, return the storage account name.
`,
  },
  {
    folder: "portal_azure_com__deleteResourceGroup",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://portal.azure.com/

* Concrete task
${LOGIN_PREAMBLE}
- Use the top search bar to search for "Resource groups".
- Click the "Resource groups" service result.
- In the resource groups list, find and click the resource group by name (e.g. "test-rg-001").
- On the resource group overview page, click "Delete resource group" in the top toolbar.
- In the confirmation dialog, type the resource group name to confirm.
- Click the "Delete" button.
- Wait for the deletion notification to appear.
- Return whether the task is successful.
`,
  },
  {
    folder: "portal_azure_com__openCloudShell",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://portal.azure.com/

* Concrete task
${LOGIN_PREAMBLE}
- Click the Cloud Shell icon (terminal icon) in the top navigation bar (it looks like a ">_" icon, usually near the notification bell).
- If prompted to select Bash or PowerShell, select "Bash".
- If prompted about storage ("You have no storage mounted"), click "Create storage" or select a subscription and create.
- Wait for the Cloud Shell terminal to load (a terminal pane appears at the bottom of the page).
- Type a command in the Cloud Shell terminal (e.g. "az account show") and press Enter.
- Wait for the command output.
- Extract the command output text.
- Return whether the task is successful. If so, return the command output.
`,
  },
  {
    folder: "portal_azure_com__viewCostAnalysis",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://portal.azure.com/

* Concrete task
${LOGIN_PREAMBLE}
- Use the top search bar to search for "Cost Management".
- Click the "Cost Management" service result.
- In the Cost Management blade, click "Cost analysis" in the left menu.
- Wait for the cost analysis chart/data to load.
- Extract the current billing period's total cost (or accumulated cost) shown on the page.
- Return whether the task is successful. If so, return the cost amount and currency.
`,
  },
  {
    folder: "portal_azure_com__listVirtualMachines",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://portal.azure.com/

* Concrete task
${LOGIN_PREAMBLE}
- Use the top search bar to search for "Virtual machines".
- Click the "Virtual machines" service result.
- Wait for the VM list to load.
- Extract the list of virtual machines shown, including for each VM: name, resource group, location, and status (Running/Stopped/Deallocated).
- Return up to 10 VMs.
- Return whether the task is successful. If so, return the list of VMs with their details.
`,
  },
  {
    folder: "portal_azure_com__viewActivityLog",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://portal.azure.com/

* Concrete task
${LOGIN_PREAMBLE}
- Use the top search bar to search for "Activity log" (or navigate via Monitor > Activity log).
- Click the "Activity log" result (under Monitor).
- Wait for the activity log entries to load.
- Extract the most recent activity log entries (up to 10), including: operation name, status (Succeeded/Failed), time, and resource.
- Return whether the task is successful. If so, return the list of recent activity log entries.
`,
  },
  {
    folder: "portal_azure_com__createWebApp",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://portal.azure.com/

* Concrete task
${LOGIN_PREAMBLE}
- Use the top search bar to search for "App Services".
- Click the "App Services" service result.
- Click the "+ Create" button, then select "Web App" if a sub-menu appears.
- In the "Create Web App" form:
  - Select a subscription (use the first available one).
  - Select or create a resource group (e.g. "test-rg-001").
  - Enter a web app name (e.g. "test-webapp-" followed by a random 5-digit number). The name must be globally unique.
  - For Runtime stack, select "Node 20 LTS" (or another available option).
  - Select a region (e.g. "East US").
  - For the App Service Plan, use an existing one or create a new Free tier plan.
- Click "Review + create".
- On the validation page, click "Create".
- Wait for the deployment to complete.
- Return whether the task is successful. If so, return the web app name and URL.
`,
  },
  {
    folder: "portal_azure_com__viewResourceGroupResources",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://portal.azure.com/

* Concrete task
${LOGIN_PREAMBLE}
- Use the top search bar to search for "Resource groups".
- Click the "Resource groups" service result.
- In the resource groups list, find and click the resource group by name (e.g. "test-rg-001").
- Wait for the resource group overview page to load.
- Extract the list of resources within this resource group, including for each resource: name, type, and location.
- Return up to 20 resources.
- Return whether the task is successful. If so, return the resource group name and the list of resources.
`,
  },
  {
    folder: "portal_azure_com__setSubscriptionBudget",
    prompt: `Please read auto_verbs\\common\\SystemPrompt1.txt

* The target website
https://portal.azure.com/

* Concrete task
${LOGIN_PREAMBLE}
- Use the top search bar to search for "Cost Management".
- Click the "Cost Management" service result.
- In the Cost Management blade, click "Budgets" in the left menu.
- Click "+ Add" to create a new budget.
- In the "Create budget" form:
  - Enter a budget name (e.g. "monthly-budget-test").
  - Set the budget amount (e.g. 100).
  - Set the reset period to "Monthly".
  - Leave other settings as defaults.
- Click "Next" to go to alert conditions (or "Create" if no alerts needed).
- If on the alerts page, optionally set an alert at 80% and 100%, then click "Create".
- Return whether the task is successful. If so, return the budget name and amount.
`,
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Azure Portal – Explore & Propose 10 New Verbs");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const batchDir = path.join(__dirname, "..", "verbs-AzurePortal-batch");

  for (const verb of VERBS) {
    const dir = path.join(batchDir, verb.folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const promptPath = path.join(dir, "prompt-create-trajectory.txt");
    fs.writeFileSync(promptPath, verb.prompt, "utf-8");
    console.log(`✅ ${verb.folder}/prompt-create-trajectory.txt`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  ✅ DONE — Created ${VERBS.length} verb prompt files`);
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch(console.error);
