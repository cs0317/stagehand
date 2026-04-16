const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Metacritic – Game Score Lookup
 *
 * Looks up a game on Metacritic and extracts Metascore, user score,
 * platform, and critic review summary.
 */

const CFG = {
  baseUrl: "https://www.metacritic.com/game",
  gameSlug: "elden-ring",
  gameTitle: "Elden Ring",
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Metacritic - Game Score Lookup");
  lines.push("Game: " + cfg.gameTitle);
  lines.push("");
  lines.push("Generated on: " + ts);
  lines.push("Recorded " + n + " browser interactions");
  lines.push('"""');
  lines.push("");
  lines.push("import re");
  lines.push("import os, sys, shutil");
  lines.push("from playwright.sync_api import Playwright, sync_playwright");
  lines.push("");
  lines.push('sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))');
  lines.push("from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws");
  lines.push("");
  lines.push("");
  lines.push("SCORE_RE = re.compile(r'^\\d+\\.?\\d*$')");
  lines.push("REVIEWS_RE = re.compile(r'^Based on ([\\d,]+) (Critic Reviews|User Ratings)$')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    game_slug: str = "' + cfg.gameSlug + '",');
  lines.push('    game_title: str = "' + cfg.gameTitle + '",');
  lines.push(") -> dict:");
  lines.push('    print(f"  Game: {game_title}")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("metacritic_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    result = {}");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '/{game_slug}/"');
  lines.push('        print(f"Loading {url}...")');
  lines.push("        page.goto(url)");
  lines.push('        page.wait_for_load_state("domcontentloaded")');
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        metascore = None");
  lines.push("        meta_label = None");
  lines.push("        meta_reviews = None");
  lines.push("        user_score = None");
  lines.push("        user_label = None");
  lines.push("        user_ratings = None");
  lines.push("        release_date = None");
  lines.push("        platform = None");
  lines.push("        critic_summary = None");
  lines.push("");
  lines.push("        i = 0");
  lines.push("        found_main_meta = False");
  lines.push("        while i < len(text_lines):");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            # Release date");
  lines.push("            if line.startswith('Released On'):");
  lines.push("                release_date = re.sub(r'^Released\\s+On:?\\s*', '', line)");
  lines.push("");
  lines.push("            # Main METASCORE section (after game title)");
  lines.push('            if line == "METASCORE" and not found_main_meta:');
  lines.push("                found_main_meta = True");
  lines.push("                # Next lines: label, 'Based on N Critic Reviews', score");
  lines.push("                for j in range(i + 1, min(i + 5, len(text_lines))):");
  lines.push("                    jline = text_lines[j]");
  lines.push("                    m = REVIEWS_RE.match(jline)");
  lines.push("                    if m and 'Critic' in m.group(2):");
  lines.push("                        meta_reviews = m.group(1)");
  lines.push("                    elif SCORE_RE.match(jline) and not metascore:");
  lines.push("                        val = jline");
  lines.push("                        if '.' not in val and int(val) <= 100:");
  lines.push("                            metascore = val");
  lines.push("                    elif jline in ('Universal Acclaim', 'Generally Favorable', 'Mixed or Average Reviews', 'Generally Unfavorable'):");
  lines.push("                        meta_label = jline");
  lines.push("");
  lines.push("            # USER SCORE section");
  lines.push('            if line == "USER SCORE" and not user_score:');
  lines.push("                for j in range(i + 1, min(i + 5, len(text_lines))):");
  lines.push("                    jline = text_lines[j]");
  lines.push("                    m = REVIEWS_RE.match(jline)");
  lines.push("                    if m and 'User' in m.group(2):");
  lines.push("                        user_ratings = m.group(1)");
  lines.push("                    elif SCORE_RE.match(jline) and '.' in jline:");
  lines.push("                        user_score = jline");
  lines.push("                    elif jline in ('Generally Favorable', 'Mixed or Average Reviews', 'Generally Unfavorable', 'Universal Acclaim'):");
  lines.push("                        user_label = jline");
  lines.push("");
  lines.push("            # First platform mention in critic reviews");
  lines.push("            if line in ('PLAYSTATION 5', 'PLAYSTATION 4', 'PC', 'XBOX SERIES X', 'XBOX ONE', 'NINTENDO SWITCH') and not platform:");
  lines.push("                platform = line");
  lines.push("");
  lines.push("            # First critic review summary (long text after a score)");
  lines.push("            if not critic_summary and len(line) > 100 and i > 10:");
  lines.push("                critic_summary = line");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"Metacritic: {game_title}")');
  lines.push('        print("=" * 60)');
  lines.push("        print(f\"\\nRelease Date: {release_date or 'N/A'}\")");
  lines.push("        print(f\"\\nMetascore:    {metascore or 'N/A'} ({meta_label or 'N/A'})\")");
  lines.push("        print(f\"  Based on:   {meta_reviews or 'N/A'} Critic Reviews\")");
  lines.push("        print(f\"\\nUser Score:   {user_score or 'N/A'} ({user_label or 'N/A'})\")");
  lines.push("        print(f\"  Based on:   {user_ratings or 'N/A'} User Ratings\")");
  lines.push("        print(f\"\\nPlatform:     {platform or 'N/A'}\")");
  lines.push('        print(f"\\nCritic Summary:")');
  lines.push("        if critic_summary:");
  lines.push("            print(f\"  {critic_summary[:200]}...\")");
  lines.push("        else:");
  lines.push("            print('  N/A')");
  lines.push("");
  lines.push("        result = {");
  lines.push('            "game": game_title,');
  lines.push('            "release_date": release_date,');
  lines.push('            "metascore": metascore,');
  lines.push('            "meta_label": meta_label,');
  lines.push('            "meta_reviews": meta_reviews,');
  lines.push('            "user_score": user_score,');
  lines.push('            "user_label": user_label,');
  lines.push('            "user_ratings": user_ratings,');
  lines.push('            "platform": platform,');
  lines.push('            "critic_summary": critic_summary,');
  lines.push("        }");
  lines.push("");
  lines.push("    except Exception as e:");
  lines.push('        print(f"Error: {e}")');
  lines.push("        import traceback");
  lines.push("        traceback.print_exc()");
  lines.push("    finally:");
  lines.push("        browser.close()");
  lines.push("        chrome_proc.terminate()");
  lines.push("        shutil.rmtree(profile_dir, ignore_errors=True)");
  lines.push("");
  lines.push("    return result");
  lines.push("");
  lines.push("");
  lines.push('if __name__ == "__main__":');
  lines.push("    with sync_playwright() as pw:");
  lines.push("        run(pw)");
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const url = CFG.baseUrl + "/" + CFG.gameSlug + "/";
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const SCORE_RE = /^\d+\.?\d*$/;
    const REVIEWS_RE = /^Based on ([\d,]+) (Critic Reviews|User Ratings)$/;
    const LABELS = new Set(["Universal Acclaim", "Generally Favorable", "Mixed or Average Reviews", "Generally Unfavorable"]);
    const PLATFORMS = new Set(["PLAYSTATION 5", "PLAYSTATION 4", "PC", "XBOX SERIES X", "XBOX ONE", "NINTENDO SWITCH"]);

    let metascore = null, metaLabel = null, metaReviews = null;
    let userScore = null, userLabel = null, userRatings = null;
    let releaseDate = null, platform = null, criticSummary = null;
    let foundMainMeta = false;

    for (let i = 0; i < tLines.length; i++) {
      const line = tLines[i];

      if (line.startsWith("Released On:")) {
        releaseDate = line.replace(/^Released On:\s*/, "");
      }

      if (line === "METASCORE" && !foundMainMeta) {
        foundMainMeta = true;
        for (let j = i + 1; j < Math.min(i + 5, tLines.length); j++) {
          const jl = tLines[j];
          const m = jl.match(REVIEWS_RE);
          if (m && m[2].includes("Critic")) metaReviews = m[1];
          else if (SCORE_RE.test(jl) && !metascore && !jl.includes(".") && parseInt(jl) <= 100) metascore = jl;
          else if (LABELS.has(jl)) metaLabel = jl;
        }
      }

      if (line === "USER SCORE" && !userScore) {
        for (let j = i + 1; j < Math.min(i + 5, tLines.length); j++) {
          const jl = tLines[j];
          const m = jl.match(REVIEWS_RE);
          if (m && m[2].includes("User")) userRatings = m[1];
          else if (SCORE_RE.test(jl) && jl.includes(".")) userScore = jl;
          else if (LABELS.has(jl)) userLabel = jl;
        }
      }

      if (PLATFORMS.has(line) && !platform) platform = line;
      if (!criticSummary && line.length > 100 && i > 10) criticSummary = line;
    }

    console.log("\n" + "=".repeat(60));
    console.log("Metacritic: " + CFG.gameTitle);
    console.log("=".repeat(60));
    console.log("\nRelease Date: " + (releaseDate || "N/A"));
    console.log("\nMetascore:    " + (metascore || "N/A") + " (" + (metaLabel || "N/A") + ")");
    console.log("  Based on:   " + (metaReviews || "N/A") + " Critic Reviews");
    console.log("\nUser Score:   " + (userScore || "N/A") + " (" + (userLabel || "N/A") + ")");
    console.log("  Based on:   " + (userRatings || "N/A") + " User Ratings");
    console.log("\nPlatform:     " + (platform || "N/A"));
    console.log("\nCritic Summary:");
    if (criticSummary) {
      console.log("  " + criticSummary.substring(0, 200) + "...");
    } else {
      console.log("  N/A");
    }

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "metacritic_game.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("\nPython script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
