const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Speedrun.com – Game Leaderboard
 *
 * Extracts top speedrun entries: runner, time, date, platform.
 */

const CFG = {
  gameSlug: "sm64",
  gameName: "Super Mario 64",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Speedrun.com – Game Leaderboard

Generated on: ${ts}
Recorded ${n} browser interactions
Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class LeaderboardRequest:
    game_slug: str = "${cfg.gameSlug}"
    game_name: str = "${cfg.gameName}"
    max_results: int = ${cfg.maxResults}


@dataclass
class RunResult:
    rank: int = 0
    runner: str = ""
    time: str = ""
    date: str = ""
    platform: str = ""


@dataclass
class LeaderboardResult:
    runs: List[RunResult] = field(default_factory=list)


def speedrun_leaderboard(page: Page, request: LeaderboardRequest) -> LeaderboardResult:
    """Extract top speedruns from leaderboard."""
    print(f"  Game: {request.game_name}\\n")

    url = f"https://www.speedrun.com/{request.game_slug}"
    print(f"Loading {url}...")
    checkpoint("Navigate to leaderboard")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = LeaderboardResult()

    checkpoint("Extract leaderboard entries")
    js_code = r\\"\\"\\"(max) => {
        const body = document.body.innerText;
        const lines = body.split('\\\\n').map(l => l.trim()).filter(l => l.length > 0);
        let verifiedCount = 0;
        let startIdx = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i] === 'Verified') {
                verifiedCount++;
                if (verifiedCount === 2) { startIdx = i + 1; break; }
            }
        }
        const runs = [];
        let rank = 1;
        let i = startIdx;
        while (i < lines.length && runs.length < max) {
            let line = lines[i];
            if (/^\\\\d+$/.test(line)) { i++; line = lines[i]; }
            const runner = line;
            i++;
            if (i >= lines.length) break;
            const time = lines[i];
            i++;
            if (i >= lines.length) break;
            const date = lines[i];
            i++;
            if (i >= lines.length) break;
            const platform = lines[i];
            i++;
            if (i >= lines.length) break;
            i++;
            if (runner && time && !runner.startsWith('Showing')) {
                runs.push({rank: rank, runner, time, date, platform});
                rank++;
            }
        }
        return runs;
    }\\"\\"\\"
    runs_data = page.evaluate(js_code, request.max_results)

    for rd in runs_data:
        run = RunResult()
        run.rank = rd.get("rank", 0)
        run.runner = rd.get("runner", "")
        run.time = rd.get("time", "")
        run.date = rd.get("date", "")
        run.platform = rd.get("platform", "")
        result.runs.append(run)

    for r in result.runs:
        print(f"\\n  #{r.rank}: {r.runner}")
        print(f"    Time:     {r.time}")
        print(f"    Date:     {r.date}")
        print(f"    Platform: {r.platform}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("speedrun")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = LeaderboardRequest()
            result = speedrun_leaderboard(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.runs)} runs")
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
    const url = `https://www.speedrun.com/${CFG.gameSlug}`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const result = await stagehand.extract({
      instruction: `Extract the top ${CFG.maxResults} speedruns from the leaderboard. For each get: runner name, completion time, date submitted, and platform.`,
      schema: {
        type: "object",
        properties: {
          runs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rank: { type: "number" },
                runner: { type: "string" },
                time: { type: "string" },
                date: { type: "string" },
                platform: { type: "string" },
              },
            },
          },
        },
      },
    });

    console.log(`\nExtracted ${result.runs?.length || 0} runs`);
    for (const r of result.runs || []) {
      console.log(`\n  #${r.rank}: ${r.runner}`);
      console.log(`  Time: ${r.time}`);
      console.log(`  Date: ${r.date}`);
      console.log(`  Platform: ${r.platform}`);
    }

    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "speedrun_leaderboard.py"), pyCode);
    console.log("\nSaved speedrun_leaderboard.py");
  } finally {
    await stagehand.close();
  }
})();
