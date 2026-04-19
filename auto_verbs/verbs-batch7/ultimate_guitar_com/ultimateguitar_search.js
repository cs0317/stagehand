const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  searchQuery: "Wonderwall Oasis",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""Auto-generated – Ultimate Guitar Tab Search (${ts}, ${n} actions)"""
import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class SearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}

@dataclass
class TabResult:
    title: str = ""
    artist: str = ""
    rating: str = ""
    type: str = ""

@dataclass
class SearchResult:
    tabs: List[TabResult] = field(default_factory=list)

def ultimateguitar_search(page, request):
    query_encoded = request.search_query.replace(" ", "+")
    url = f"https://www.ultimate-guitar.com/search.php?search_type=title&value={query_encoded}"
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})
    result = SearchResult()
    checkpoint("Extract tab results")
    js_code = r\\"\\"\\"(max) => {
        const lines = document.body.innerText.split('\\\\n').map(l=>l.trim()).filter(l=>l.length>0);
        let s=0; for(let i=0;i<lines.length;i++){
            if(lines[i].includes('ARTIST')&&lines[i].includes('TYPE')){s=i+1;break;}
        }
        let artist=''; let i=s; if(i<lines.length){artist=lines[i];i++;}
        const types=['Chords','Tab','Guitar Pro','Bass','Power','Drums','Video','Ukulele'];
        const tabs=[];
        while(i<lines.length&&tabs.length<max){
            const l=lines[i];
            if(!l||l==='NEXT >'||l==='Sign up')break;
            if(l==='Misc Mashups'||l==='Sledding With Tigers'){artist=l;i++;continue;}
            if(l.startsWith('Official version')||l.startsWith('Lead ')||l==='High quality'||l==='Official'||l==='Pro'){i++;continue;}
            if(/^\\\\d+:\\\\d+$/.test(l)){i++;continue;}
            if(types.includes(l)){i++;continue;}
            if(/^[\\\\d,]+$/.test(l)){i++;continue;}
            const title=l.replace(/\\\\*$/,''); i++;
            let rating='',tabType='';
            while(i<lines.length){
                const n=lines[i];
                if(/^[\\\\d,]+$/.test(n)){rating=n;i++;continue;}
                if(types.includes(n)){tabType=n;i++;break;}
                if(n==='High quality'||n==='Official'){i++;continue;}
                break;
            }
            if(title&&tabType)tabs.push({title,artist,rating,type:tabType});
        }
        return tabs;
    }\\"\\"\\"
    for td in page.evaluate(js_code, request.max_results):
        t = TabResult(); t.title=td.get("title",""); t.artist=td.get("artist","")
        t.rating=td.get("rating",""); t.type=td.get("type","")
        result.tabs.append(t)
    for i,t in enumerate(result.tabs,1): print(f"  Tab {i}: {t.title} by {t.artist} ({t.type}, {t.rating})")
    return result

def test_func():
    port = get_free_port(); profile_dir = get_temp_profile_dir("ultimateguitar")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url); ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = ultimateguitar_search(page, SearchRequest())
            print(f"\\n=== DONE === Found {len(result.tabs)} tabs")
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
    const url = \`https://www.ultimate-guitar.com/search.php?search_type=title&value=\${CFG.searchQuery.replace(/ /g, "+")}\`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);
    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} tab results with title, artist, rating, and type.\`,
      schema: { type: "object", properties: { tabs: { type: "array", items: { type: "object", properties: { title: { type: "string" }, artist: { type: "string" }, rating: { type: "string" }, type: { type: "string" } } } } } },
    });
    console.log(\`Extracted \${result.tabs?.length || 0} tabs\`);
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "ultimateguitar_search.py"), genPython(CFG, recorder));
  } finally { await stagehand.close(); }
})();
