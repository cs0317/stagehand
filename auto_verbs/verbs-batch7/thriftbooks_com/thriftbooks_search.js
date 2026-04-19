const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  searchQuery: "1984 George Orwell",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""Auto-generated – ThriftBooks Book Search (${ts}, ${n} actions)"""
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
class BookResult:
    title: str = ""
    author: str = ""
    price: str = ""
    condition: str = ""
    format: str = ""

@dataclass
class SearchResult:
    books: List[BookResult] = field(default_factory=list)

def thriftbooks_search(page, request):
    query_encoded = request.search_query.replace(" ", "+")
    url = f"https://www.thriftbooks.com/browse/?b.search={query_encoded}"
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})
    result = SearchResult()
    checkpoint("Extract book results")
    js_code = r\\"\\"\\"(max) => {
        const lines = document.body.innerText.split('\\\\n').map(l=>l.trim()).filter(l=>l.length>0);
        let s=0; for(let i=0;i<lines.length;i++){if(lines[i]==='Exclude'){s=i+1;break;}}
        const books=[]; let i=s;
        while(i<lines.length&&books.length<max){
            const title=lines[i]; i++;
            if(!title)break;
            let author='';
            if(i<lines.length&&lines[i].startsWith('By ')){author=lines[i].replace('By ','');i++;}
            let price='';
            if(i<lines.length){
                if(lines[i]==='$'&&i+1<lines.length&&/^[\\\\d,.]+$/.test(lines[i+1])){price='$'+lines[i+1];i+=2;}
                else if(/^\\\\$\\\\s*[\\\\d,.]+$/.test(lines[i])){price=lines[i];i++;}
            }
            if(i<lines.length&&lines[i].startsWith('Save '))i++;
            let fmt='';if(i<lines.length&&lines[i].startsWith('Format:')){fmt=lines[i].replace('Format: ','');i++;}
            let cond='';if(i<lines.length&&lines[i].startsWith('Condition:')){cond=lines[i].replace('Condition: ','');i++;}
            while(i<lines.length&&(lines[i].startsWith('Add To')||lines[i].startsWith('See ')||lines[i]==='Backorder'))i++;
            if(title&&price)books.push({title,author,price,condition:cond,format:fmt});
        }
        return books;
    }\\"\\"\\"
    for bd in page.evaluate(js_code, request.max_results):
        b = BookResult(); b.title = bd.get("title",""); b.author = bd.get("author","")
        b.price = bd.get("price",""); b.condition = bd.get("condition",""); b.format = bd.get("format","")
        result.books.append(b)
    for i,b in enumerate(result.books,1):
        print(f"  Book {i}: {b.title} by {b.author} - {b.price} ({b.condition}, {b.format})")
    return result

def test_func():
    port = get_free_port(); profile_dir = get_temp_profile_dir("thriftbooks")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url); ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = thriftbooks_search(page, SearchRequest())
            print(f"\\n=== DONE === Found {len(result.books)} books")
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
    const url = \`https://www.thriftbooks.com/browse/?b.search=\${CFG.searchQuery.replace(/ /g, "+")}\`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);
    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} book results with title, author, price, condition, and format.\`,
      schema: { type: "object", properties: { books: { type: "array", items: { type: "object", properties: { title: { type: "string" }, author: { type: "string" }, price: { type: "string" }, condition: { type: "string" }, format: { type: "string" } } } } } },
    });
    console.log(\`Extracted \${result.books?.length || 0} books\`);
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "thriftbooks_search.py"), genPython(CFG, recorder));
  } finally { await stagehand.close(); }
})();
