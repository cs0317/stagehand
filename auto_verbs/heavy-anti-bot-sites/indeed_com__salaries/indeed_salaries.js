const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");
const CFG = { url: "https://www.indeed.com", jobTitle: "data scientist", location: "New York, NY", waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script – Indeed Salary Search
Job: ${cfg.jobTitle}, Location: ${cfg.location}
Generated on: ${ts}
"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, job_title: str = "${cfg.jobTitle}", location: str = "${cfg.location}") -> dict:
    print(f"  Job title: {job_title}"); print(f"  Location: {location}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("indeed_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    result = {"average_salary": "N/A", "salary_range": "N/A", "top_companies": []}
    try:
        print("Loading Indeed salary page...")
        page.goto("${cfg.url}/career/salaries")
        page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass

        print(f'STEP 1: Search for "{job_title}" in "{location}"...')
        title_input = page.locator('input[name="q"], input[aria-label*="job title" i], input[placeholder*="job title" i]').first
        title_input.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); title_input.type(job_title, delay=50); page.wait_for_timeout(1000)

        loc_input = page.locator('input[name="l"], input[aria-label*="location" i], input[placeholder*="location" i]').first
        loc_input.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); loc_input.type(location, delay=50); page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        page.wait_for_timeout(2000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)

        print("STEP 2: Extract salary info...")
        try:
            avg_el = page.locator('[class*="salary-average"], [data-testid*="salary"], h1:has-text("$"), [class*="cmp-salary-amount"]').first
            result["average_salary"] = avg_el.inner_text(timeout=3000).strip()
        except Exception: pass
        try:
            range_el = page.locator('[class*="salary-range"], [class*="range"]').first
            result["salary_range"] = range_el.inner_text(timeout=3000).strip()
        except Exception: pass
        try:
            company_els = page.locator('[class*="company-name"], [data-testid*="company"]')
            for j in range(min(company_els.count(), 5)):
                c = company_els.nth(j).inner_text(timeout=2000).strip()
                if c: result["top_companies"].append(c)
        except Exception: pass

        print(f"\\nSalary results for '{job_title}' in '{location}':")
        print(f"  Average: {result['average_salary']}")
        print(f"  Range: {result['salary_range']}")
        print(f"  Top companies: {', '.join(result['top_companies']) if result['top_companies'] else 'N/A'}")
    except Exception as e: import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)
    return result

if __name__ == "__main__":
    with sync_playwright() as playwright: run(playwright)
`;
}

async function main() {
  const recorder = new PlaywrightRecorder(); const llmClient = setupLLMClient("hybrid"); let stagehand;
  try {
    stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient, localBrowserLaunchOptions: { userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"), headless: false, viewport: { width: 1920, height: 1080 }, args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized"] } });
    await stagehand.init(); const page = stagehand.context.pages()[0];
    await page.goto(`${CFG.url}/career/salaries`); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(CFG.waits.page);
    await stagehand.act(`Type '${CFG.jobTitle}' into the job title field`);
    await stagehand.act(`Type '${CFG.location}' into the location field and press Enter`);
    await page.waitForTimeout(CFG.waits.search);
    const { z } = require("zod/v3");
    const info = await stagehand.extract(`Extract salary info: average salary, salary range, and top paying companies.`,
      z.object({ averageSalary: z.string(), salaryRange: z.string(), topCompanies: z.array(z.string()) }));
    recorder.record("extract", { instruction: "Extract salary", results: info });
    fs.writeFileSync(path.join(__dirname, "indeed_salaries.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return info;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); }
}
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
