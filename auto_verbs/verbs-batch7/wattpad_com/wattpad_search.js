const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  searchQuery: "fantasy adventure",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""Auto-generated – Wattpad Story Search (${ts}, ${n} actions)"""
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
class StoryResult:
    title: str = ""
    reads: str = ""
    votes: str = ""
    parts: str = ""
    description: str = ""

@dataclass
class SearchResult:
    stories: List[StoryResult] = field(default_factory=list)

def wattpad_search(page, request):
    query_encoded = request.search_query.replace(" ", "%20")
    url = f"https://www.wattpad.com/search/{query_encoded}"
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})
    result = SearchResult()
    checkpoint("Extract story results")
    js_code = r\\"\\"\\"(max) => {
        const lines = document.body.innerText.split('\\\\n').map(l=>l.trim()).filter(l=>l.length>0);
        let i=0;for(;i<lines.length;i++){if(lines[i]==='Refine by tag'){i++;break;}}
        while(i<lines.length-1){if(lines[i]===lines[i+1]&&lines[i].length>3)break;i++;}
        const stories=[];
        while(i<lines.length&&stories.length<max){
            const title=lines[i];i++;if(!title||title.length<3)break;
            if(i<lines.length&&lines[i]===title)i++;
            while(i<lines.length&&(lines[i]==='Complete'||lines[i]==='Ongoing'))i++;
            let reads='',votes='',parts='';
            while(i<lines.length&&lines[i].startsWith('Reads'))i++;
            if(i<lines.length&&/^[\\\\d,]+$/.test(lines[i]))i++;
            if(i<lines.length&&/^[\\\\d.]+[KM]?$/.test(lines[i])){reads=lines[i];i++;}
            else if(i<lines.length&&/^[\\\\d,]+$/.test(lines[i])){reads=lines[i];i++;}
            while(i<lines.length&&lines[i].startsWith('Votes'))i++;
            if(i<lines.length&&/^[\\\\d,]+$/.test(lines[i]))i++;
            if(i<lines.length&&/^[\\\\d,.]+[KM]?$/.test(lines[i])){votes=lines[i];i++;}
            else if(i<lines.length&&/^[\\\\d,]+$/.test(lines[i])){votes=lines[i];i++;}
            while(i<lines.length&&lines[i].startsWith('Parts'))i++;
            if(i<lines.length&&/^\\\\d+$/.test(lines[i])){parts=lines[i];i++;}
            if(i<lines.length&&/^\\\\d+$/.test(lines[i]))i++;
            while(i<lines.length&&lines[i].startsWith('Time'))i++;
            while(i<lines.length&&(/^\\\\d+h\\\\s*\\\\d*m?$/.test(lines[i])||/^\\\\d+ hours?/.test(lines[i])||/^\\\\d+m$/.test(lines[i])||/^\\\\d+ minutes?/.test(lines[i])))i++;
            let desc='';if(i<lines.length&&lines[i].length>30){desc=lines[i].substring(0,200);i++;}
            if(title&&title.length>5)stories.push({title,reads,votes,parts,description:desc});
        }
        return stories;
    }\\"\\"\\"
    for sd in page.evaluate(js_code, request.max_results):
        s = StoryResult(); s.title=sd.get("title",""); s.reads=sd.get("reads","")
        s.votes=sd.get("votes",""); s.parts=sd.get("parts",""); s.description=sd.get("description","")
        result.stories.append(s)
    for i,s in enumerate(result.stories,1): print(f"  Story {i}: {s.title} ({s.reads} reads, {s.votes} votes)")
    return result

def test_func():
    port = get_free_port(); profile_dir = get_temp_profile_dir("wattpad")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url); ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = wattpad_search(page, SearchRequest())
            print(f"\\n=== DONE === Found {len(result.stories)} stories")
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
    const url = \`https://www.wattpad.com/search/\${encodeURIComponent(CFG.searchQuery)}\`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);
    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} story results with title, reads, votes, parts, and description.\`,
      schema: { type: "object", properties: { stories: { type: "array", items: { type: "object", properties: { title: { type: "string" }, reads: { type: "string" }, votes: { type: "string" }, parts: { type: "string" }, description: { type: "string" } } } } } },
    });
    console.log(\`Extracted \${result.stories?.length || 0} stories\`);
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "wattpad_search.py"), genPython(CFG, recorder));
  } finally { await stagehand.close(); }
})();
