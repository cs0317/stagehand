const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  searchQuery: "short film documentary",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""Auto-generated – Vimeo Video Search (${ts}, ${n} actions)"""
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
class VideoResult:
    title: str = ""
    creator: str = ""
    duration: str = ""
    views: str = ""
    likes: str = ""

@dataclass
class SearchResult:
    videos: List[VideoResult] = field(default_factory=list)

def vimeo_search(page, request):
    query_encoded = request.search_query.replace(" ", "+")
    url = f"https://vimeo.com/search?q={query_encoded}"
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})
    result = SearchResult()
    checkpoint("Extract video results")
    js_code = r\\"\\"\\"(max) => {
        const lines = document.body.innerText.split('\\\\n').map(l=>l.trim()).filter(l=>l.length>0);
        let s=0; for(let i=0;i<lines.length;i++){if(lines[i]==='Filters'&&i<20){s=i+1;break;}}
        const vids=[]; let i=s;
        while(i<lines.length&&vids.length<max){
            if(!/^\\\\d[\\\\d,.]*$/.test(lines[i])){i++;continue;}
            const likes=lines[i];i++;
            if(i<lines.length&&/^\\\\d[\\\\d,.]*$/.test(lines[i]))i++;
            let dur='';if(i<lines.length&&/^\\\\d+:\\\\d+$/.test(lines[i])){dur=lines[i];i++;}
            let title='';if(i<lines.length){title=lines[i];i++;}
            let creator='';if(i<lines.length){creator=lines[i];i++;}
            let views='';if(i<lines.length){const m=lines[i].match(/([\\\\d,.]+K?)\\\\s*views/);if(m)views=m[1]+' views';i++;}
            if(title&&dur)vids.push({title,creator,duration:dur,views,likes});
        }
        return vids;
    }\\"\\"\\"
    for vd in page.evaluate(js_code, request.max_results):
        v = VideoResult(); v.title=vd.get("title",""); v.creator=vd.get("creator","")
        v.duration=vd.get("duration",""); v.views=vd.get("views",""); v.likes=vd.get("likes","")
        result.videos.append(v)
    for i,v in enumerate(result.videos,1): print(f"  Video {i}: {v.title} by {v.creator} ({v.duration})")
    return result

def test_func():
    port = get_free_port(); profile_dir = get_temp_profile_dir("vimeo")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url); ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = vimeo_search(page, SearchRequest())
            print(f"\\n=== DONE === Found {len(result.videos)} videos")
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
    const url = \`https://vimeo.com/search?q=\${CFG.searchQuery.replace(/ /g, "+")}\`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);
    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} video results with title, creator, duration, views, and likes.\`,
      schema: { type: "object", properties: { videos: { type: "array", items: { type: "object", properties: { title: { type: "string" }, creator: { type: "string" }, duration: { type: "string" }, views: { type: "string" }, likes: { type: "string" } } } } } },
    });
    console.log(\`Extracted \${result.videos?.length || 0} videos\`);
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "vimeo_search.py"), genPython(CFG, recorder));
  } finally { await stagehand.close(); }
})();
