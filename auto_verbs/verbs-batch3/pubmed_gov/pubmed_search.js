const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * PubMed – Article Search
 *
 * Searches PubMed for articles and extracts listings.
 */

const CFG = {
  baseUrl: "https://pubmed.ncbi.nlm.nih.gov/",
  query: "CRISPR gene therapy",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("PubMed - Article Search");
  lines.push("Query: " + cfg.query);
  lines.push("");
  lines.push("Generated on: " + ts);
  lines.push("Recorded " + n + " browser interactions");
  lines.push('"""');
  lines.push("");
  lines.push("import re");
  lines.push("import os, sys, shutil");
  lines.push("from urllib.parse import quote_plus");
  lines.push("from playwright.sync_api import Playwright, sync_playwright");
  lines.push("");
  lines.push('sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))');
  lines.push("from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws");
  lines.push("");
  lines.push("");
  lines.push("ARTICLE_NUM_RE = re.compile(r'^\\d+$')");
  lines.push("JOURNAL_RE = re.compile(r'^(.+?)\\. (\\d{4}(?:\\s+\\w{3,4})?)')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    query: str = "' + cfg.query + '",');
  lines.push("    max_results: int = " + cfg.maxResults + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  Query: {query}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("pubmed_gov")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '?term={quote_plus(query)}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Skip to 'Search Results'");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines):");
  lines.push("            if text_lines[i] == 'Search Results':");
  lines.push("                i += 1");
  lines.push("                break");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            # Article number");
  lines.push("            if ARTICLE_NUM_RE.match(line) and i + 4 < len(text_lines) and text_lines[i + 1] == 'Cite':");
  lines.push("                title = text_lines[i + 2]");
  lines.push("                authors = text_lines[i + 3]");
  lines.push("                journal_line = text_lines[i + 4]");
  lines.push("");
  lines.push("                # Parse journal name and date");
  lines.push("                jm = JOURNAL_RE.match(journal_line)");
  lines.push("                journal = jm.group(1) if jm else journal_line");
  lines.push("                pub_date = jm.group(2) if jm else 'N/A'");
  lines.push("");
  lines.push("                results.append({");
  lines.push("                    'title': title,");
  lines.push("                    'authors': authors,");
  lines.push("                    'journal': journal,");
  lines.push("                    'pub_date': pub_date,");
  lines.push("                })");
  lines.push("                i += 5");
  lines.push("                continue");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"PubMed: {query}")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['title']}\")");
  lines.push("            print(f\"   Authors: {r['authors']}\")");
  lines.push("            print(f\"   Journal: {r['journal']}\")");
  lines.push("            print(f\"   Date:    {r['pub_date']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} articles")');
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
  lines.push("    return results");
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

  const ARTICLE_NUM_RE = /^\d+$/;
  const JOURNAL_RE = /^(.+?)\. (\d{4}(?:\s+\w{3,4})?)/;

  try {
    const url = CFG.baseUrl + "?term=" + encodeURIComponent(CFG.query);
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const results = [];

    // Skip to "Search Results"
    let i = 0;
    while (i < tLines.length) {
      if (tLines[i] === "Search Results") { i++; break; }
      i++;
    }

    while (i < tLines.length && results.length < CFG.maxResults) {
      const line = tLines[i];

      if (ARTICLE_NUM_RE.test(line) && i + 4 < tLines.length && tLines[i + 1] === "Cite") {
        const title = tLines[i + 2];
        const authors = tLines[i + 3];
        const journalLine = tLines[i + 4];

        const jm = journalLine.match(JOURNAL_RE);
        const journal = jm ? jm[1] : journalLine;
        const pubDate = jm ? jm[2] : "N/A";

        results.push({ title, authors, journal, pubDate });
        i += 5;
        continue;
      }
      i++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("PubMed: " + CFG.query);
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.title);
      console.log("   Authors: " + r.authors);
      console.log("   Journal: " + r.journal);
      console.log("   Date:    " + r.pubDate);
    }
    console.log("\nFound " + results.length + " articles");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "pubmed_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
