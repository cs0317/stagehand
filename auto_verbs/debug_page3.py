import sys, shutil
sys.path.insert(0, 'verbs')
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright.sync_api import sync_playwright

url = sys.argv[1]
port = get_free_port()
pd = get_temp_profile_dir("debug3")
cp = launch_chrome(pd, port)
ws = wait_for_cdp_ws(port)
with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp(ws)
    ctx = b.contexts[0]
    p = ctx.pages[0] if ctx.pages else ctx.new_page()
    p.goto(url, wait_until="domcontentloaded", timeout=30000)
    p.wait_for_timeout(8000)
    info = p.evaluate('''() => {
        const cards = document.querySelectorAll('[class*="book"], [class*="product"], [class*="search-result"], article, [class*="item"]');
        let out = "cards: " + cards.length + "\\n";
        for (let i = 0; i < Math.min(3, cards.length); i++) {
            const c = cards[i];
            out += "card" + i + ": tag=" + c.tagName + " class=" + c.className.substring(0,60) + "\\n";
            const h2a = c.querySelector("h2 a");
            const h2 = c.querySelector("h2");
            out += "  h2a=" + (h2a ? h2a.textContent.trim().substring(0,40) : "null") + "\\n";
            out += "  h2=" + (h2 ? h2.textContent.trim().substring(0,40) : "null") + "\\n";
        }
        return out;
    }''')
    print(info)
    b.close()
    cp.terminate()
    shutil.rmtree(pd, ignore_errors=True)
