import shutil, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright
sys.path.insert(0, 'verbs')
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
port = get_free_port(); pd = get_temp_profile_dir('npm_dbg3'); cp = launch_chrome(pd, port); ws = wait_for_cdp_ws(port)
with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp(ws); ctx = b.contexts[0]; p = ctx.pages[0] if ctx.pages else ctx.new_page()
    p.goto('https://www.npmjs.com/search?q=date+formatting', wait_until='domcontentloaded', timeout=30000)
    p.wait_for_timeout(5000)
    r = p.evaluate('''() => {
        var body = document.body.innerText;
        var lines = body.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
        var start = lines.findIndex(l => l.includes('packages found'));
        var out = 'NPM_DEBUG_START=' + start + '\\n';
        for (var i = start; i < Math.min(start + 12, lines.length); i++) {
            var isNum = /^[\\d,]+$/.test(lines[i]);
            var isPub = /^published version/.test(lines[i]);
            out += 'L' + i + (isNum ? '[NUM]' : '') + (isPub ? '[PUB]' : '') + ': ' + lines[i].substring(0, 80) + '\\n';
        }
        return out;
    }''')
    print(r)
    b.close()
cp.terminate(); shutil.rmtree(pd, True)
import shutil, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright
sys.path.insert(0, 'verbs')
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
port = get_free_port(); pd = get_temp_profile_dir('npm_dbg2'); cp = launch_chrome(pd, port); ws = wait_for_cdp_ws(port)
with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp(ws); ctx = b.contexts[0]; p = ctx.pages[0] if ctx.pages else ctx.new_page()
    p.goto('https://www.npmjs.com/search?q=date+formatting', wait_until='domcontentloaded', timeout=30000)
    p.wait_for_timeout(5000)
    r = p.evaluate('''() => {
        var body = document.body.innerText;
        var lines = body.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
        var start = lines.findIndex(l => l.includes('packages found'));
        var out = 'Start: ' + start + '\\n';
        // Show lines around first download count
        for (var i = start; i < Math.min(start + 25, lines.length); i++) {
            var isNum = /^[\\d,]+$/.test(lines[i]);
            out += i + (isNum ? ' [NUM]' : '') + ': ' + JSON.stringify(lines[i].substring(0, 100)) + '\\n';
        }
        return out;
    }''')
    print(r)
    b.close()
cp.terminate(); shutil.rmtree(pd, True)
import shutil, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright
sys.path.insert(0, 'verbs')
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
port = get_free_port(); pd = get_temp_profile_dir('npm_dbg'); cp = launch_chrome(pd, port); ws = wait_for_cdp_ws(port)
with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp(ws); ctx = b.contexts[0]; p = ctx.pages[0] if ctx.pages else ctx.new_page()
    p.goto('https://www.npmjs.com/search?q=date+formatting', wait_until='domcontentloaded', timeout=30000)
    p.wait_for_timeout(5000)
    r = p.evaluate('''() => {
        var body = document.body.innerText;
        var lines = body.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
        var out = 'Total lines: ' + lines.length + '\\n';
        var start = lines.findIndex(l => l.includes('packages found'));
        out += 'Start idx: ' + start + '\\n';
        for (var i = start; i < Math.min(start + 30, lines.length); i++) {
            out += i + ': [' + lines[i].substring(0, 120) + ']\\n';
        }
        return out;
    }''')
    print(r)
    b.close()
cp.terminate(); shutil.rmtree(pd, True)
import subprocess, json, time, sys, os, shutil
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "verbs"))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright.sync_api import sync_playwright

port = get_free_port()
profile = get_temp_profile_dir("npm_dbg")
proc = launch_chrome(profile, port)
ws = wait_for_cdp_ws(port)
pw = sync_playwright().start()
browser = pw.chromium.connect_over_cdp(ws)
page = browser.contexts[0].pages[0]
page.goto("https://www.npmjs.com/search?q=date+formatting", timeout=30000)
page.wait_for_timeout(8000)

data = page.evaluate("""() => {
    const body = document.body.innerText;
    const lines = body.split('\\n').map(l => l.trim()).filter(l => l);
    const start = lines.findIndex(l => l.includes('packages found'));
    return lines.slice(start >= 0 ? start : 0, start >= 0 ? start + 60 : 60);
}""")
for i, line in enumerate(data):
    print(f"  [{i}] {line}")

browser.close()
pw.stop()
proc.kill()
shutil.rmtree(profile, ignore_errors=True)
