const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  searchQuery: "Lo-Fi Hip Hop Radio",
  maxResults: 10,
  waits: { page: 6000, scroll: 3000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""Auto-generated – YouTube Playlist (${ts}, ${n} actions)"""
import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class PlaylistRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}

@dataclass
class VideoResult:
    index: str = ""
    title: str = ""
    channel: str = ""
    duration: str = ""
    views_info: str = ""

@dataclass
class PlaylistResult:
    playlist_title: str = ""
    videos: List[VideoResult] = field(default_factory=list)

def youtube_playlist(page, request):
    query_encoded = request.search_query.replace(" ", "+")
    search_url = f"https://www.youtube.com/results?search_query={query_encoded}&sp=EgIQAw%253D%253D"
    checkpoint("Search for playlist")
    page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(${cfg.waits.page})
    checkpoint("Find playlist link")
    playlist_url = page.evaluate(r\\"\\"\\"() => {
        const links = Array.from(document.querySelectorAll('a[href*="list="]'));
        for(const a of links){const h=a.getAttribute('href');if(h&&h.includes('/playlist?list='))return h;if(h&&h.includes('&list=')){const m=h.match(/list=([^&]+)/);if(m)return '/playlist?list='+m[1];}}
        return null;
    }\\"\\"\\")
    if not playlist_url: print("  No playlist found"); return PlaylistResult()
    full_url = f"https://www.youtube.com{playlist_url}" if playlist_url.startswith("/") else playlist_url
    checkpoint("Navigate to playlist")
    page.goto(full_url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(${cfg.waits.page})
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(${cfg.waits.scroll})
    result = PlaylistResult()
    checkpoint("Extract video list")
    js_code = r\\"\\"\\"(max) => {
        const lines=document.body.innerText.split('\\\\n').map(l=>l.trim()).filter(l=>l.length>0);
        let pt='',i=0;for(;i<lines.length;i++){if(lines[i]==='Play all')break;}
        for(let j=0;j<i;j++){if(lines[j].length>5&&!['Skip navigation','Sign in','Home','Shorts','Subscriptions','You'].includes(lines[j])){pt=lines[j];break;}}
        let si=0,pc=0;for(let j=0;j<lines.length;j++){if(lines[j]==='Play all'){pc++;if(pc===2){si=j+1;break;}}}
        if(pc<2){for(let j=0;j<lines.length;j++){if(lines[j]==='Play all'){si=j+1;break;}}}
        i=si;const vids=[];const dr=/^\\\\d{1,2}:\\\\d{2}(:\\\\d{2})?$/;const nr=/^\\\\d+$/;
        while(i<lines.length&&vids.length<max){
            if(!nr.test(lines[i]))break;const idx=lines[i];i++;
            let dur='';if(i<lines.length&&dr.test(lines[i])){dur=lines[i];i++;}
            if(i<lines.length&&lines[i]==='Now playing')i++;
            if(i>=lines.length)break;const title=lines[i];i++;
            let ch='';if(i<lines.length&&lines[i]!=='\\u2022'&&!nr.test(lines[i])){ch=lines[i];i++;}
            if(i<lines.length&&lines[i]==='\\u2022')i++;
            let vi='';if(i<lines.length&&!nr.test(lines[i])&&lines[i]!=='Play all'){vi=lines[i];i++;}
            vids.push({index:idx,title,channel:ch,duration:dur,viewsInfo:vi});
        }
        return {playlistTitle:pt,videos:vids};
    }\\"\\"\\"
    data = page.evaluate(js_code, request.max_results)
    result.playlist_title = data.get("playlistTitle","")
    for vd in data.get("videos",[]):
        v = VideoResult(); v.index=vd.get("index",""); v.title=vd.get("title","")
        v.channel=vd.get("channel",""); v.duration=vd.get("duration",""); v.views_info=vd.get("viewsInfo","")
        result.videos.append(v)
    for v in result.videos: print(f"  {v.index}. [{v.duration}] {v.title} - {v.channel}")
    return result

def test_func():
    port = get_free_port(); profile_dir = get_temp_profile_dir("youtube_playlist")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url); ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = youtube_playlist(page, PlaylistRequest())
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
    const url = \`https://www.youtube.com/results?search_query=\${encodeURIComponent(CFG.searchQuery)}&sp=EgIQAw%3D%3D\`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(CFG.waits.page);
    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} playlist videos with index, title, channel, duration, and views info.\`,
      schema: { type: "object", properties: { videos: { type: "array", items: { type: "object", properties: { index: { type: "string" }, title: { type: "string" }, channel: { type: "string" }, duration: { type: "string" }, views_info: { type: "string" } } } } } },
    });
    console.log(\`Extracted \${result.videos?.length || 0} videos\`);
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "youtube_playlist.py"), genPython(CFG, recorder));
  } finally { await stagehand.close(); }
})();
