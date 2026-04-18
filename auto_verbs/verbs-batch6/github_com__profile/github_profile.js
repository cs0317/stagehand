const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  username: "torvalds",
  maxRepos: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
GitHub – User Profile
Username: "${cfg.username}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ProfileRequest:
    username: str = "${cfg.username}"
    max_repos: int = ${cfg.maxRepos}


@dataclass
class Repo:
    name: str = ""
    description: str = ""
    stars: str = ""


@dataclass
class ProfileResult:
    display_name: str = ""
    bio: str = ""
    location: str = ""
    public_repos: str = ""
    followers: str = ""
    repos: list = field(default_factory=list)


def github_profile(page: Page, request: ProfileRequest) -> ProfileResult:
    """Look up GitHub user profile."""
    print(f"  Username: {request.username}\\n")

    url = f"https://github.com/{request.username}"
    print(f"Loading {url}...")
    checkpoint("Navigate to GitHub profile")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract profile data")
    body_text = page.evaluate("document.body.innerText") or ""

    display_name = request.username
    bio = ""
    location = ""
    public_repos = ""
    followers = ""

    try:
        name_el = page.locator('[itemprop="name"], h1.vcard-names span').first
        if name_el.is_visible(timeout=2000):
            display_name = name_el.inner_text().strip()
    except Exception:
        pass

    try:
        bio_el = page.locator('[data-bio-text], [class*="user-profile-bio"], [itemprop="description"]').first
        if bio_el.is_visible(timeout=2000):
            bio = bio_el.inner_text().strip()
    except Exception:
        pass

    try:
        loc_el = page.locator('[itemprop="homeLocation"], [class*="vcard-detail"][aria-label*="ocation"]').first
        if loc_el.is_visible(timeout=2000):
            location = loc_el.inner_text().strip()
    except Exception:
        pass

    fm = re.search(r"(\\d[\\d,]*)\\s*followers?", body_text, re.IGNORECASE)
    if fm:
        followers = fm.group(1)

    rm = re.search(r"(\\d+)\\s*(?:public\\s+)?repositor", body_text, re.IGNORECASE)
    if rm:
        public_repos = rm.group(1)

    checkpoint("Extract pinned/popular repos")
    repos_data = page.evaluate(r"""(maxRepos) => {
        const results = [];
        const pins = document.querySelectorAll(
            '[class*="pinned-item"], [class*="repo-card"], [class*="Box--row"]'
        );
        const seen = new Set();
        for (const pin of pins) {
            if (results.length >= maxRepos) break;
            const nameEl = pin.querySelector('a[href*="/"] span, a[data-hovercard-type="repository"]');
            const name = nameEl ? nameEl.innerText.trim() : '';
            if (!name || seen.has(name)) continue;
            seen.add(name);

            const descEl = pin.querySelector('p, [class*="pinned-item-desc"]');
            const description = descEl ? descEl.innerText.trim().slice(0, 200) : '';

            const starsEl = pin.querySelector('[href*="stargazers"], [class*="star"]');
            const stars = starsEl ? starsEl.innerText.trim() : '';

            results.push({ name, description, stars });
        }
        return results;
    }""", request.max_repos)

    repos = [Repo(**r) for r in repos_data]

    result = ProfileResult(
        display_name=display_name, bio=bio, location=location,
        public_repos=public_repos, followers=followers, repos=repos,
    )

    print("\\n" + "=" * 60)
    print(f"GitHub: {result.display_name} (@{request.username})")
    print("=" * 60)
    print(f"  Bio:          {result.bio[:80]}")
    print(f"  Location:     {result.location}")
    print(f"  Public Repos: {result.public_repos}")
    print(f"  Followers:    {result.followers}")
    print(f"  Pinned Repos:")
    for r in result.repos:
        print(f"    {r.name} ({r.stars} stars)")
        print(f"      {r.description[:60]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("github_com__profile")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = github_profile(page, ProfileRequest())
            print(f"\\nReturned profile for {result.display_name}")
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
    const url = `https://github.com/${CFG.username}`;
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to GitHub profile" });

    const profileData = await stagehand.extract(
      "extract the user display name, bio, location, number of public repos, followers count, and pinned repositories with name, description, and star count"
    );
    console.log("\n📊 Profile:", JSON.stringify(profileData, null, 2));
    recorder.record("extract", { instruction: "Extract profile", results: profileData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "github_profile.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
