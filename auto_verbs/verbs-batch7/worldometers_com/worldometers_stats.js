const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""Auto-generated – Worldometers Stats (${ts}, ${n} actions)"""
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class StatsRequest:
    pass

@dataclass
class StatsResult:
    world_population: str = ""
    births_today: str = ""
    deaths_today: str = ""
    net_growth_today: str = ""
    births_this_year: str = ""
    deaths_this_year: str = ""
    net_growth_this_year: str = ""

def worldometers_stats(page, request):
    checkpoint("Navigate to Worldometers")
    page.goto("https://www.worldometers.info", wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})
    result = StatsResult()
    checkpoint("Extract statistics")
    js_code = r\\"\\"\\"() => {
        const lines = document.body.innerText.split('\\\\n').map(l=>l.trim()).filter(l=>l.length>0);
        const data = {};
        for(let i=0;i<lines.length;i++){
            const label=lines[i].toLowerCase();
            if(label==='current world population'&&i>0) data.world_population=lines[i-1];
            else if(label==='births today'&&i>0) data.births_today=lines[i-1];
            else if(label==='deaths today'&&i>0) data.deaths_today=lines[i-1];
            else if(label==='net population growth today'&&i>0) data.net_growth_today=lines[i-1];
            else if(label==='births this year'&&i>0) data.births_this_year=lines[i-1];
            else if(label==='deaths this year'&&i>0) data.deaths_this_year=lines[i-1];
            else if(label==='net population growth this year'&&i>0) data.net_growth_this_year=lines[i-1];
        }
        return data;
    }\\"\\"\\"
    data = page.evaluate(js_code)
    result.world_population=data.get("world_population",""); result.births_today=data.get("births_today","")
    result.deaths_today=data.get("deaths_today",""); result.net_growth_today=data.get("net_growth_today","")
    result.births_this_year=data.get("births_this_year",""); result.deaths_this_year=data.get("deaths_this_year","")
    result.net_growth_this_year=data.get("net_growth_this_year","")
    print(f"  Population: {result.world_population}  Births today: {result.births_today}  Deaths today: {result.deaths_today}")
    return result

def test_func():
    port = get_free_port(); profile_dir = get_temp_profile_dir("worldometers")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url); ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = worldometers_stats(page, StatsRequest())
            print("\\n=== DONE ===")
        finally: browser.close(); chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger; run_with_debugger(test_func)
`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;
  try {
    await page.goto("https://www.worldometers.info", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);
    const result = await stagehand.extract({
      instruction: "Extract current world population, births today, deaths today, net population growth today, births this year, deaths this year, net population growth this year.",
      schema: { type: "object", properties: { world_population: { type: "string" }, births_today: { type: "string" }, deaths_today: { type: "string" }, net_growth_today: { type: "string" }, births_this_year: { type: "string" }, deaths_this_year: { type: "string" }, net_growth_this_year: { type: "string" } } },
    });
    console.log("Extracted:", JSON.stringify(result, null, 2));
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "worldometers_stats.py"), genPython(CFG, recorder));
  } finally { await stagehand.close(); }
})();
