const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  region: "moab",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""Auto-generated – Trailforks Trails (${ts}, ${n} actions)"""
import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class TrailRequest:
    region: str = "${cfg.region}"
    max_results: int = ${cfg.maxResults}

@dataclass
class TrailResult:
    name: str = ""
    riding_area: str = ""
    distance: str = ""
    descent: str = ""
    climb: str = ""

@dataclass
class TrailsResult:
    trails: List[TrailResult] = field(default_factory=list)

def trailforks_trails(page, request):
    url = f"https://www.trailforks.com/region/{request.region}/trails/"
    checkpoint("Navigate to trails page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})
    result = TrailsResult()
    checkpoint("Extract trail data")
    js_code = r\\"\\"\\"(max) => {
        const lines = document.body.innerText.split('\\\\n');
        let s=0; for(let i=0;i<lines.length;i++){
            const p=lines[i].split('\\\\t').map(s=>s.trim()).filter(s=>s);
            if(p.length===1&&p[0]==='climb'){s=i+1;break;}
        }
        const trails=[]; let i=s;
        while(i<lines.length-1&&trails.length<max){
            const np=lines[i].split('\\\\t').map(s=>s.trim()).filter(s=>s); i++;
            if(np.length<1)continue;
            const dp=lines[i].split('\\\\t').map(s=>s.trim()).filter(s=>s); i++;
            const name=np[0]||''; const area=np[1]||'';
            if(!name||/^Showing|^Page/.test(name))break;
            trails.push({name,riding_area:area,distance:dp[0]||'',descent:dp[1]||'',climb:dp[2]||''});
        }
        return trails;
    }\\"\\"\\"
    for td in page.evaluate(js_code, request.max_results):
        t = TrailResult(); t.name = td.get("name",""); t.riding_area = td.get("riding_area","")
        t.distance = td.get("distance",""); t.descent = td.get("descent",""); t.climb = td.get("climb","")
        result.trails.append(t)
    for i,t in enumerate(result.trails,1):
        print(f"  Trail {i}: {t.name} ({t.riding_area}) - {t.distance}, descent: {t.descent}, climb: {t.climb}")
    return result

def test_func():
    port = get_free_port(); profile_dir = get_temp_profile_dir("trailforks")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url); ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = trailforks_trails(page, TrailRequest())
            print(f"\\n=== DONE === Found {len(result.trails)} trails")
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
    const url = \`https://www.trailforks.com/region/\${CFG.region}/trails/\`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);
    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} mountain bike trails with name, riding area, distance, descent, and climb.\`,
      schema: { type: "object", properties: { trails: { type: "array", items: { type: "object", properties: { name: { type: "string" }, riding_area: { type: "string" }, distance: { type: "string" }, descent: { type: "string" }, climb: { type: "string" } } } } } },
    });
    console.log(\`Extracted \${result.trails?.length || 0} trails\`);
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "trailforks_trails.py"), genPython(CFG, recorder));
  } finally { await stagehand.close(); }
})();
