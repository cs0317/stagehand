import sys, shutil
sys.path.insert(0, 'verbs')
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright.sync_api import sync_playwright

url = sys.argv[1]
port = get_free_port()
pd = get_temp_profile_dir("debug2")
cp = launch_chrome(pd, port)
ws = wait_for_cdp_ws(port)
with sync_playwright() as pw:
    b = pw.chromium.connect_over_cdp(ws)
    ctx = b.contexts[0]
    p = ctx.pages[0] if ctx.pages else ctx.new_page()
    p.goto(url, wait_until="domcontentloaded", timeout=30000)
    p.wait_for_timeout(8000)
    info = p.evaluate('''() => {
        const cards = document.querySelectorAll('.sku-item, [class*="list-item"], [class*="product-item"]');
        const cardsInfo = "cards found: " + cards.length;
        // Check what classes first product container has
        const h3s = document.querySelectorAll("h3");
        const h3Info = Array.from(h3s).slice(0,3).map(h => {
            const p = h.parentElement;
            const pp = p ? p.parentElement : null;
            return "h3: " + h.textContent.trim().substring(0,40) + " parent:" + (p ? p.tagName + "." + p.className.substring(0,50) : "none") + " gp:" + (pp ? pp.tagName + "." + pp.className.substring(0,50) : "none");
        }).join("\\n");
        return cardsInfo + "\\n" + h3Info;
    }''')
    print(info)
    b.close()
    cp.terminate()
    shutil.rmtree(pd, ignore_errors=True)
