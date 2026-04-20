const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Wolfram Alpha – Query for computational answers
 */

const CFG = {
  query: "population of Tokyo",
  waits: { page: 8000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Wolfram Alpha – Query for computational answers

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class WolframalphaSearchRequest:
    query: str = "${cfg.query}"


@dataclass
class WolframalphaPodItem:
    pod_title: str = ""
    pod_value: str = ""


@dataclass
class WolframalphaSearchResult:
    query_input: str = ""
    result_pods: List[WolframalphaPodItem] = field(default_factory=list)


def wolframalpha_search(page: Page, request: WolframalphaSearchRequest) -> WolframalphaSearchResult:
    """Query Wolfram Alpha for computational answers."""
    print(f"  Query: {request.query}\\n")

    query = request.query.replace(" ", "+")
    url = f"https://www.wolframalpha.com/input?i={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Wolfram Alpha results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    result = WolframalphaSearchResult()
    result.query_input = request.query

    checkpoint("Extract result pods")
    js_code = """() => {
        const pods = document.querySelectorAll('[class*="pod"], [class*="Pod"], section[class*="result"], [id*="pod"], [data-testid*="pod"]');
        const items = [];
        for (const pod of pods) {
            const titleEl = pod.querySelector('h2, h3, [class*="title"], [class*="header"], [class*="Title"]');
            const valueEl = pod.querySelector('[class*="content"], [class*="value"], [class*="output"], [class*="subpod"], img[alt]');

            let pod_title = titleEl ? titleEl.textContent.trim() : '';
            let pod_value = '';
            if (valueEl) {
                if (valueEl.tagName === 'IMG' && valueEl.alt) {
                    pod_value = valueEl.alt.trim();
                } else {
                    pod_value = valueEl.textContent.trim();
                }
            }

            if (pod_title || pod_value) {
                items.push({pod_title, pod_value});
            }
        }
        return items;
    }"""
    pods_data = page.evaluate(js_code)

    for d in pods_data:
        item = WolframalphaPodItem()
        item.pod_title = d.get("pod_title", "")
        item.pod_value = d.get("pod_value", "")
        result.result_pods.append(item)

    print(f"  Input: {result.query_input}")
    for i, pod in enumerate(result.result_pods, 1):
        print(f"\\n  Pod {i}:")
        print(f"    Title: {pod.pod_title}")
        print(f"    Value: {pod.pod_value[:200]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("wolframalpha")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = WolframalphaSearchRequest()
            result = wolframalpha_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.result_pods)} pods")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const query = CFG.query.replace(/ /g, "+");
    const url = `https://www.wolframalpha.com/input?i=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      "Extract all result pods from the Wolfram Alpha output. For each pod get the pod title and pod value/content."
    );
    recorder.record("extract", "result pods", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "wolframalpha_search.py"), genPython(CFG, recorder));
    console.log("Saved wolframalpha_search.py");
  } finally {
    await stagehand.close();
  }
})();
