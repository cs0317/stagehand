const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * exercism.org – Python Track Exercises
 *
 * Browse the Python track on Exercism and extract
 * exercise name, difficulty/type, and description.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://exercism.org/tracks/python/exercises",
  track: "python",
  maxResults: 10,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
exercism.org – Python Track Exercises
Track: ${cfg.track}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ExercismRequest:
    track: str = "${cfg.track}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class ExercismExercise:
    exercise_name: str = ""
    difficulty: str = ""
    description: str = ""


@dataclass(frozen=True)
class ExercismResult:
    exercises: list = None  # list[ExercismExercise]


def exercism_exercises(page: Page, request: ExercismRequest) -> ExercismResult:
    """Browse Exercism track exercises."""
    track = request.track
    max_results = request.max_results
    print(f"  Track: {track}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate ──────────────────────────────────────────────────────
    url = f"https://exercism.org/tracks/{track}/exercises"
    print(f"Loading {url}...")
    checkpoint("Navigate to Exercism exercises")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    print(f"  Loaded: {page.url}")

    # ── Extract exercises ─────────────────────────────────────────────
    checkpoint("Extract exercise listings")
    results_data = page.evaluate(r"""(maxResults) => {
        const widgets = document.querySelectorAll('a.c-exercise-widget');
        const results = [];
        for (const w of widgets) {
            if (results.length >= maxResults) break;
            const titleEl = w.querySelector('.--title');
            const typeEl = w.querySelector('.c-exercise-type-tag');
            const blurbEl = w.querySelector('.--blurb');
            if (!titleEl) continue;
            results.push({
                name: titleEl.textContent.trim(),
                difficulty: typeEl ? typeEl.textContent.trim() : '',
                description: blurbEl ? blurbEl.textContent.trim() : ''
            });
        }
        return results;
    }""", max_results)

    exercises = []
    for r in results_data:
        exercises.append(ExercismExercise(
            exercise_name=r.get("name", ""),
            difficulty=r.get("difficulty", ""),
            description=r.get("description", ""),
        ))

    # ── Print results ─────────────────────────────────────────────────
    print("=" * 60)
    print(f'Exercism - {track.title()} Track Exercises')
    print("=" * 60)
    for idx, e in enumerate(exercises, 1):
        print(f"\\n{idx}. {e.exercise_name}")
        print(f"   Difficulty: {e.difficulty}")
        print(f"   {e.description}")

    print(f"\\nFound {len(exercises)} exercises")
    return ExercismResult(exercises=exercises)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("exercism_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = exercism_exercises(page, ExercismRequest())
            print(f"\\nReturned {len(result.exercises or [])} exercises")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
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
    console.log(`\n🌐 Navigating to ${CFG.url}...`);
    await page.goto(CFG.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: CFG.url, description: `Browse Exercism ${CFG.track} exercises` });
    console.log(`   Loaded: ${page.url()}`);

    console.log(`\n🎯 Extracting up to ${CFG.maxResults} exercises...\n`);

    const results = await page.evaluate((maxResults) => {
      const widgets = document.querySelectorAll("a.c-exercise-widget");
      const out = [];
      for (const w of widgets) {
        if (out.length >= maxResults) break;
        const titleEl = w.querySelector(".--title");
        const typeEl = w.querySelector(".c-exercise-type-tag");
        const blurbEl = w.querySelector(".--blurb");
        if (!titleEl) continue;
        out.push({
          name: titleEl.textContent.trim(),
          difficulty: typeEl ? typeEl.textContent.trim() : "",
          description: blurbEl ? blurbEl.textContent.trim() : "",
        });
      }
      return out;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract exercise listings",
      description: `Extracted ${results.length} exercises`,
      results,
    });

    console.log(`📋 Found ${results.length} exercises:\n`);
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.name}`);
      console.log(`      Difficulty: ${r.difficulty}`);
      console.log(`      ${r.description}`);
    });

    const dir = path.join(__dirname);
    const actionsFile = path.join(dir, "recorded_actions.json");
    fs.writeFileSync(actionsFile, JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions → ${actionsFile}`);

    const pyFile = path.join(dir, "exercism_exercises.py");
    fs.writeFileSync(pyFile, genPython(CFG, recorder));
    console.log(`🐍 Saved Python script → ${pyFile}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
