import sys, shutil, os
os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, 'verbs')
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright.sync_api import sync_playwright

port = get_free_port()
pd = get_temp_profile_dir("fn")
cp = launch_chrome(pd, port)
ws = wait_for_cdp_ws(port)
pw = sync_playwright().start()
b = pw.chromium.connect_over_cdp(ws)
ctx = b.contexts[0]
p = ctx.pages[0] if ctx.pages else ctx.new_page()
p.goto("https://www.foodnetwork.com/search/chicken-", wait_until="domcontentloaded", timeout=30000)
p.wait_for_timeout(8000)

r = p.evaluate('''() => {
    const cards = document.querySelectorAll('[class*="recipe"], article, [class*="card"], [class*="result-item"], li[class*="item"]');
    let out = "cards: " + cards.length + "\\n";
    for (let i = 0; i < Math.min(3, cards.length); i++) {
        const c = cards[i];
        const h = c.querySelector("h3, h2");
        out += "card" + i + ": " + c.tagName + "." + c.className.substring(0,40) + " h=" + (h ? h.textContent.trim().substring(0,40) : "null") + "\\n";
    }
    const h3s = document.querySelectorAll("h3");
    out += "\\nh3 count: " + h3s.length + "\\n";
    for (let i = 0; i < Math.min(5, h3s.length); i++) {
        out += "h3[" + i + "]: " + h3s[i].textContent.trim().substring(0,50) + " in:" + h3s[i].parentElement.tagName + "." + h3s[i].parentElement.className.substring(0,30) + "\\n";
    }
    return out;
}''')
print(r)
b.close()
cp.terminate()
shutil.rmtree(pd, True)
