const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  muscle: "chest",
  maxExercises: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Bodybuilding.com – Exercise Database
Muscle: "${cfg.muscle}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ExerciseRequest:
    muscle: str = "${cfg.muscle}"
    max_exercises: int = ${cfg.maxExercises}


@dataclass
class Exercise:
    name: str = ""
    muscle_group: str = ""
    equipment: str = ""
    difficulty: str = ""


@dataclass
class ExerciseResult:
    exercises: list = field(default_factory=list)


def bodybuilding_exercises(page: Page, request: ExerciseRequest) -> ExerciseResult:
    """Search Bodybuilding.com exercise database."""
    print(f"  Muscle: {request.muscle}\\n")

    url = f"https://www.bodybuilding.com/exercises/finder/?muscle={quote_plus(request.muscle)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to exercise database")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract exercise listings")
    exercises_data = page.evaluate(r"""(maxExercises) => {
        const results = [];
        const items = document.querySelectorAll(
            '.ExResult, [class*="exercise"], article, .ExCard, a[href*="/exercises/"]'
        );
        const seen = new Set();
        for (const item of items) {
            if (results.length >= maxExercises) break;
            const nameEl = item.querySelector('h2, h3, h4, .ExHeading, [class*="name"]');
            const name = nameEl ? nameEl.innerText.trim() : '';
            if (!name || name.length < 3 || seen.has(name)) continue;
            seen.add(name);

            const text = item.innerText || '';
            const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);

            let muscle_group = '', equipment = '', difficulty = '';
            for (const line of lines) {
                if (/chest|back|shoulder|bicep|tricep|leg|quad|hamstring|glute|abs|core/i.test(line) && !muscle_group) {
                    muscle_group = line;
                }
                if (/barbell|dumbbell|cable|machine|body|band|kettlebell/i.test(line) && !equipment) {
                    equipment = line;
                }
                if (/beginner|intermediate|advanced|easy|hard/i.test(line) && !difficulty) {
                    difficulty = line;
                }
            }

            results.push({ name, muscle_group, equipment, difficulty });
        }
        return results;
    }""", request.max_exercises)

    result = ExerciseResult(exercises=[Exercise(**e) for e in exercises_data])

    print("\\n" + "=" * 60)
    print(f"Bodybuilding.com: {request.muscle} exercises")
    print("=" * 60)
    for e in result.exercises:
        print(f"  {e.name}")
        print(f"    Muscle: {e.muscle_group}  Equipment: {e.equipment}  Level: {e.difficulty}")
    print(f"\\n  Total: {len(result.exercises)} exercises")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("bodybuilding_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = bodybuilding_exercises(page, ExerciseRequest())
            print(f"\\nReturned {len(result.exercises)} exercises")
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
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const url = `https://www.bodybuilding.com/exercises/finder/?muscle=${encodeURIComponent(CFG.muscle)}`;
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to exercise database" });

    const exData = await stagehand.extract(
      "extract up to 5 exercises with exercise name, muscle group, equipment needed, and difficulty level"
    );
    console.log("\n📊 Exercises:", JSON.stringify(exData, null, 2));
    recorder.record("extract", { instruction: "Extract exercises", results: exData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "bodybuilding_exercises.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
