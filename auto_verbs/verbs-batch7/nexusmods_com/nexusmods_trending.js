const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Nexus Mods – Trending Mods
 *
 * Browse trending mods for a game. Extracts mod name, author, category,
 * description, endorsements, downloads, and URL.
 */

const CFG = {
  game: "skyrimspecialedition",
  maxResults: 5,
  waits: { page: 6000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Nexus Mods – Trending Mods

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, re, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SearchRequest:
    game: str = "${cfg.game}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Mod:
    mod_name: str = ""
    author: str = ""
    category: str = ""
    description: str = ""
    endorsements: str = ""
    downloads: str = ""
    url: str = ""


@dataclass
class SearchResult:
    mods: List[Mod] = field(default_factory=list)


def nexusmods_trending(page: Page, request: SearchRequest) -> SearchResult:
    """Browse trending mods on Nexus Mods."""
    print(f"  Game: {request.game}\\n")

    url = f"https://www.nexusmods.com/{request.game}/mods/trending"
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    raw = page.evaluate(r${"`"}""(max) => {
        const tiles = document.querySelectorAll('[class*="mod-tile"][class*="bg-surface"]');
        const results = [];
        for (const tile of tiles) {
            const text = tile.innerText.trim();
            if (!text || !text.includes('Endorsements')) continue;

            const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
            const mod_name = lines[0] || '';
            const author = lines[1] || '';
            const category = lines[2] || '';

            let description = '';
            let endorsements = '';
            let downloads = '';
            const endorseIdx = lines.indexOf('Endorsements');
            if (endorseIdx > 4) {
                description = lines.slice(5, endorseIdx).join(' ');
                endorsements = lines[endorseIdx + 1] || '';
            }
            const dlIdx = lines.indexOf('Downloads');
            if (dlIdx >= 0) {
                downloads = lines[dlIdx + 1] || '';
            }

            const link = tile.querySelector('a[href*="/mods/"]');
            const href = link ? link.href : '';

            results.push({ mod_name, author, category, description, endorsements, downloads, url: href });
            if (results.length >= max) break;
        }
        return results;
    }${"`"}""", request.max_results)

    result = SearchResult()
    for item in raw:
        result.mods.append(Mod(
            mod_name=item.get("mod_name", ""),
            author=item.get("author", ""),
            category=item.get("category", ""),
            description=item.get("description", ""),
            endorsements=item.get("endorsements", ""),
            downloads=item.get("downloads", ""),
            url=item.get("url", ""),
        ))
    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("nexusmods_trending")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            req = SearchRequest()
            result = nexusmods_trending(page, req)
            print(f"\\n=== DONE ===")
            print(f"Found {len(result.mods)} mods\\n")
            for i, m in enumerate(result.mods, 1):
                print(f"  Mod {i}:")
                print(f"    Name:         {m.mod_name}")
                print(f"    Author:       {m.author}")
                print(f"    Category:     {m.category}")
                print(f"    Endorsements: {m.endorsements}")
                print(f"    Downloads:    {m.downloads}")
                print(f"    URL:          {m.url}")
                print(f"    Description:  {m.description[:120]}...")
                print()
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
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    llmClient: setupLLMClient(),
  });
  await stagehand.init();
  const recorder = new PlaywrightRecorder("nexusmods_trending");
  const page = stagehand.context.pages()[0];

  try {
    const url = \`https://www.nexusmods.com/\${CFG.game}/mods/trending\`;
    recorder.recordAction("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const mods = await stagehand.extract(
      \`extract the first \${CFG.maxResults} trending mods with name, author, category, description, endorsements, downloads, and url\`
    );
    console.log("Extracted:", JSON.stringify(mods, null, 2));

    const outDir = path.dirname(__filename);
    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    fs.writeFileSync(
      path.join(outDir, "nexusmods_trending.py"),
      genPython(CFG, recorder)
    );
    console.log("Files saved.");
  } finally {
    await stagehand.close();
  }
})();
