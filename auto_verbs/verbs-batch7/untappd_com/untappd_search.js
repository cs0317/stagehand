const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  searchQuery: "IPA",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""Auto-generated – Untappd Beer Search (${ts}, ${n} actions)"""
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
class BeerResult:
    name: str = ""
    brewery: str = ""
    style: str = ""
    abv: str = ""
    ibu: str = ""
    rating: str = ""

@dataclass
class SearchResult:
    beers: List[BeerResult] = field(default_factory=list)

def untappd_search(page, request):
    url = f"https://untappd.com/search?q={request.search_query}&type=beer"
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})
    result = SearchResult()
    checkpoint("Extract beer results")
    js_code = r\\"\\"\\"(max) => {
        const lines = document.body.innerText.split('\\\\n').map(l=>l.trim()).filter(l=>l.length>0);
        let s=0; for(let i=0;i<lines.length;i++){if(lines[i]==='Lowest ABV'){s=i+1;break;}}
        const beers=[]; let i=s;
        while(i<lines.length&&beers.length<max){
            const name=lines[i];i++;if(!name||name==='Please sign in to view more.')break;
            let brewery='',style='',abv='',ibu='',rating='';
            if(i<lines.length){brewery=lines[i];i++;}
            if(i<lines.length){style=lines[i];i++;}
            if(i<lines.length&&lines[i].includes('ABV')){abv=lines[i];i++;}
            if(i<lines.length&&lines[i].includes('IBU')){ibu=lines[i];i++;}
            if(i<lines.length&&/^\\\\([\\\\d.]+\\\\)$/.test(lines[i])){rating=lines[i].replace(/[()]/g,'');i++;}
            beers.push({name,brewery,style,abv,ibu,rating});
        }
        return beers;
    }\\"\\"\\"
    for bd in page.evaluate(js_code, request.max_results):
        b = BeerResult(); b.name=bd.get("name",""); b.brewery=bd.get("brewery","")
        b.style=bd.get("style",""); b.abv=bd.get("abv",""); b.ibu=bd.get("ibu",""); b.rating=bd.get("rating","")
        result.beers.append(b)
    for i,b in enumerate(result.beers,1): print(f"  Beer {i}: {b.name} by {b.brewery} ({b.abv}, {b.rating})")
    return result

def test_func():
    port = get_free_port(); profile_dir = get_temp_profile_dir("untappd")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url); ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = untappd_search(page, SearchRequest())
            print(f"\\n=== DONE === Found {len(result.beers)} beers")
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
    const url = \`https://untappd.com/search?q=\${CFG.searchQuery}&type=beer\`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);
    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} beer results with name, brewery, style, ABV, IBU, and rating.\`,
      schema: { type: "object", properties: { beers: { type: "array", items: { type: "object", properties: { name: { type: "string" }, brewery: { type: "string" }, style: { type: "string" }, abv: { type: "string" }, ibu: { type: "string" }, rating: { type: "string" } } } } } },
    });
    console.log(\`Extracted \${result.beers?.length || 0} beers\`);
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "untappd_search.py"), genPython(CFG, recorder));
  } finally { await stagehand.close(); }
})();
