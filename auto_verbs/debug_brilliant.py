import sys, shutil
sys.path.insert(0, 'verbs')
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright.sync_api import sync_playwright

port = get_free_port()
pd = get_temp_profile_dir("d6")
cp = launch_chrome(pd, port)
ws = wait_for_cdp_ws(port)
pw = sync_playwright().start()
b = pw.chromium.connect_over_cdp(ws)
ctx = b.contexts[0]
p = ctx.pages[0] if ctx.pages else ctx.new_page()
p.goto("https://brilliant.org/courses/#math", wait_until="domcontentloaded", timeout=30000)
p.wait_for_timeout(8000)
r = p.evaluate('''() => {
    var h = document.querySelectorAll("h3");
    return Array.from(h).slice(0, 5).map(e => {
        var a = e.closest("a");
        var pr = e.parentElement;
        var gp = pr ? pr.parentElement : null;
        return "h3=" + e.textContent.trim().substring(0, 30) +
               " inA=" + (a ? "yes href=" + a.href.substring(0, 40) : "no") +
               " parent=" + (pr ? pr.tagName + "." + pr.className.substring(0, 40) : "none") +
               " gp=" + (gp ? gp.tagName + "." + gp.className.substring(0, 40) : "none");
    }).join("\\n");
}''')
print(r)

cards = p.evaluate('''() => {
    var c = document.querySelectorAll('[class*="course"], [class*="card"], [class*="CourseCard"], a[href*="/courses/"]');
    return c.length;
}''')
print("cards selector matches:", cards)

b.close()
cp.terminate()
shutil.rmtree(pd, True)
