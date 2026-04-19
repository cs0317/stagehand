const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  searchQuery: "best indoor plants low light",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""Auto-generated – The Spruce Article Search (${ts}, ${n} actions)"""
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
class ArticleResult:
    title: str = ""

@dataclass
class SearchResult:
    articles: List[ArticleResult] = field(default_factory=list)

def thespruce_search(page, request):
    query_encoded = request.search_query.replace(" ", "+")
    url = f"https://www.thespruce.com/search?q={query_encoded}"
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})
    result = SearchResult()
    checkpoint("Extract search results")
    js_code = r\\"\\"\\"(max) => {
        const lines = document.body.innerText.split('\\\\n').map(l=>l.trim()).filter(l=>l.length>0);
        let s=0; for(let i=0;i<lines.length;i++){if(lines[i]==='Search Results'){s=i+1;break;}}
        const a=[]; for(let i=s;i<lines.length&&a.length<max;i++){
            if(/^\\\\d+$/.test(lines[i])||lines[i]==='Next')break;
            if(lines[i].length>10)a.push({title:lines[i]});
        } return a;
    }\\"\\"\\"
    for ad in page.evaluate(js_code, request.max_results):
        a = ArticleResult(); a.title = ad.get("title",""); result.articles.append(a)
    for i,a in enumerate(result.articles,1): print(f"  Article {i}: {a.title}")
    return result

def test_func():
    port = get_free_port(); profile_dir = get_temp_profile_dir("thespruce")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url); ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = thespruce_search(page, SearchRequest())
            print(f"\\n=== DONE === Found {len(result.articles)} articles")
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
    const url = \`https://www.thespruce.com/search?q=\${CFG.searchQuery.replace(/ /g, "+")}\`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);
    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} article titles from search results.\`,
      schema: { type: "object", properties: { articles: { type: "array", items: { type: "object", properties: { title: { type: "string" } } } } } },
    });
    console.log(\`Extracted \${result.articles?.length || 0} articles\`);
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "thespruce_search.py"), genPython(CFG, recorder));
  } finally { await stagehand.close(); }
})();
