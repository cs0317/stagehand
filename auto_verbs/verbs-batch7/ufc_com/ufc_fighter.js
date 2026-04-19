const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  fighterSlug: "jon-jones",
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""Auto-generated – UFC Fighter Profile (${ts}, ${n} actions)"""
import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class FighterRequest:
    fighter_slug: str = "${cfg.fighterSlug}"

@dataclass
class FightResult:
    opponent: str = ""
    date: str = ""
    result: str = ""
    method: str = ""
    round: str = ""

@dataclass
class FighterProfile:
    name: str = ""
    nickname: str = ""
    record: str = ""
    weight_class: str = ""
    height: str = ""
    reach: str = ""
    recent_fights: List[FightResult] = field(default_factory=list)

def ufc_fighter(page, request):
    url = f"https://www.ufc.com/athlete/{request.fighter_slug}"
    checkpoint("Navigate to fighter page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})
    checkpoint("Extract fighter info")
    js_code = r\\"\\"\\"() => {
        const lines = document.body.innerText.split('\\\\n').map(l=>l.trim()).filter(l=>l.length>0);
        let name='',nickname='',record='',weight_class='';
        for(let i=0;i<lines.length;i++){
            if(lines[i].startsWith('"')&&lines[i].endsWith('"')){
                nickname=lines[i].replace(/"/g,'');
                if(i+1<lines.length)name=lines[i+1];
                for(let j=i-1;j>=0;j--){if(lines[j].includes('Division')){weight_class=lines[j];break;}}
                break;
            }
        }
        for(let i=0;i<lines.length;i++){if(/^\\\\d+-\\\\d+-\\\\d+\\\\s*\\\\(W-L-D\\\\)$/.test(lines[i])){record=lines[i];break;}}
        let height='',reach='';
        for(let i=0;i<lines.length;i++){
            if(lines[i]==='HEIGHT'&&i+1<lines.length)height=lines[i+1];
            if(lines[i]==='REACH'&&i+1<lines.length)reach=lines[i+1];
        }
        const fights=[];let inRec=false;
        for(let i=0;i<lines.length;i++){
            if(lines[i]==='ATHLETE RECORD'){inRec=true;continue;}
            if(!inRec)continue;if(lines[i]==='LOAD MORE'||lines[i]==='INFO')break;
            if((lines[i]==='WIN'||lines[i]==='LOSS'||lines[i]==='DRAW')&&fights.length<3){
                const r=lines[i],m=lines[i+1]||'',d=lines[i+2]||'';
                let rd='',mt='';
                for(let j=i+3;j<Math.min(i+10,lines.length);j++){
                    if(lines[j]==='Round'&&j+1<lines.length)rd=lines[j+1];
                    if(lines[j]==='Method'&&j+1<lines.length)mt=lines[j+1];
                    if(lines[j]==='WATCH REPLAY')break;
                }
                fights.push({opponent:m,date:d,result:r,method:mt,round:rd});
            }
        }
        return {name,nickname,record,weight_class,height,reach,fights};
    }\\"\\"\\"
    data = page.evaluate(js_code)
    profile = FighterProfile()
    profile.name = data.get("name",""); profile.nickname = data.get("nickname","")
    profile.record = data.get("record",""); profile.weight_class = data.get("weight_class","")
    profile.height = data.get("height",""); profile.reach = data.get("reach","")
    for fd in data.get("fights",[]):
        f = FightResult(); f.opponent=fd.get("opponent",""); f.date=fd.get("date","")
        f.result=fd.get("result",""); f.method=fd.get("method",""); f.round=fd.get("round","")
        profile.recent_fights.append(f)
    print(f"  {profile.name} ({profile.nickname}) - {profile.record}")
    for i,f in enumerate(profile.recent_fights,1): print(f"    {i}. {f.result} vs {f.opponent} ({f.date})")
    return profile

def test_func():
    port = get_free_port(); profile_dir = get_temp_profile_dir("ufc")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url); ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = ufc_fighter(page, FighterRequest())
            print(f"\\n=== DONE ===")
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
    await page.goto(\`https://www.ufc.com/athlete/\${CFG.fighterSlug}\`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);
    const result = await stagehand.extract({
      instruction: "Extract the fighter's name, nickname, record, weight class, height, reach, and last 3 fight results.",
      schema: { type: "object", properties: { name: { type: "string" }, nickname: { type: "string" }, record: { type: "string" }, weight_class: { type: "string" }, height: { type: "string" }, reach: { type: "string" }, fights: { type: "array", items: { type: "object", properties: { opponent: { type: "string" }, date: { type: "string" }, result: { type: "string" }, method: { type: "string" }, round: { type: "string" } } } } } },
    });
    console.log(\`Extracted: \${result.name} - \${result.record}\`);
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "ufc_fighter.py"), genPython(CFG, recorder));
  } finally { await stagehand.close(); }
})();
