const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * StubHub – Event Ticket Search
 *
 * Searches StubHub for events matching a keyword.
 * Extracts event name, venue, date, and lowest ticket price.
 */

const CFG = {
  url: "https://www.stubhub.com/secure/search",
  query: "NBA",
  maxResults: 5,
  waits: { page: 2000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Playwright script (Python) — StubHub Event Ticket Search
Search for event tickets by keyword.
Extract event name, venue, date, and lowest ticket price.

URL pattern: https://www.stubhub.com/secure/search?q={query}

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os
import sys
import shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


MONTHS_3 = {
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
}

VENUE_RE = re.compile(
    r"^(TBA|\\d{1,2}:\\d{2}\\s*[AP]M)"
    r"(.+?,\\s*[A-Z]{2},\\s*US(?:A)?)"
    r"(.+)$"
)


def _parse_venue_line(line):
    m = VENUE_RE.match(line)
    if m:
        return m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
    return "", line, ""


def run(
    playwright: Playwright,
    query: str = "${cfg.query}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("stubhub_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        search_url = f"https://www.stubhub.com/secure/search?q={quote_plus(query)}"
        print(f"Loading {search_url}...")
        page.goto(search_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        link_els = page.locator('a[href*="/event/"]')
        link_count = link_els.count()
        event_hrefs = []
        for i in range(link_count):
            href = link_els.nth(i).get_attribute("href") or ""
            if "/event/" in href:
                event_hrefs.append(href)

        body = page.locator("body").inner_text(timeout=10000)
        lines = [l.strip() for l in body.split("\\n") if l.strip()]

        ticket_indices = [i for i, l in enumerate(lines) if l == "See tickets"]

        events_raw = []
        for ti in ticket_indices:
            if len(events_raw) >= max_results:
                break
            if ti < 2:
                continue
            venue_line = lines[ti - 1]
            event_name = lines[ti - 2]
            time_str, location, venue = _parse_venue_line(venue_line)

            date_parts = []
            idx = ti - 3
            while idx >= 0:
                candidate = lines[idx]
                if candidate in ("See tickets", "See more"):
                    break
                if candidate in MONTHS_3 or re.match(r"^\\d{1,2}(-\\d{1,2})?$", candidate) or re.match(
                    r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(-\\w+)?$", candidate
                ):
                    date_parts.insert(0, candidate)
                    idx -= 1
                elif candidate == "TBA":
                    date_parts.insert(0, "TBA")
                    idx -= 1
                else:
                    break

            date_str = " ".join(date_parts) if date_parts else "TBA"
            if time_str and time_str != "TBA":
                date_str += f" {time_str}"

            events_raw.append({
                "name": event_name,
                "venue": venue if venue else location,
                "date": date_str,
                "location": location,
                "price": "N/A",
            })

        for i, evt in enumerate(events_raw):
            if i >= len(event_hrefs):
                break
            href = event_hrefs[i]
            if not href.startswith("http"):
                href = "https://www.stubhub.com" + href
            base_href = href.split("?")[0]
            try:
                page.goto(base_href, timeout=20000)
                page.wait_for_load_state("domcontentloaded")
                page.wait_for_timeout(4000)
                detail_body = page.locator("body").inner_text(timeout=8000)
                price_match = re.search(r"\\$(\\d[\\d,]*)", detail_body)
                if price_match:
                    evt["price"] = f"\\${price_match.group(1)}"
            except Exception:
                pass

        results = events_raw[:max_results]

        print(f'\\nFound {len(results)} events for "{query}":\\n')
        for idx, e in enumerate(results, 1):
            print(f"  {idx}. {e['name']}")
            print(f"     Venue: {e['venue']}")
            print(f"     Date: {e['date']}")
            print(f"     Location: {e['location']}")
            print(f"     Lowest Price: {e['price']}")
            print()

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\\nTotal events found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  StubHub – Event Ticket Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(\`  🔍 Query: \${CFG.query}\`);
  console.log(\`  📊 Max results: \${CFG.maxResults}\\n\`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
      },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    const searchUrl = \`\${CFG.url}?q=\${encodeURIComponent(CFG.query)}\`;
    console.log(\`🌐 Loading \${searchUrl}...\`);
    recorder.goto(searchUrl);
    await page.goto(searchUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.search);
    console.log("✅ Loaded\\n");

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      \`Extract up to \${CFG.maxResults} event listings. For each, get the event name, venue name, date/time, and lowest ticket price.\`,
      z.object({
        events: z.array(z.object({
          name: z.string().describe("Event name"),
          venue: z.string().describe("Venue name"),
          date: z.string().describe("Event date and time"),
          price: z.string().describe("Lowest ticket price or 'N/A'"),
        })).describe(\`Up to \${CFG.maxResults} events\`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract event listings",
      description: \`Extract up to \${CFG.maxResults} events\`,
      results: listings,
    });

    console.log(\`📋 Found \${listings.events.length} events:\`);
    listings.events.forEach((e, i) => {
      console.log(\`   \${i + 1}. \${e.name}\`);
      console.log(\`      Venue: \${e.venue}  Date: \${e.date}  Price: \${e.price}\`);
    });

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "stubhub_search.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(\`\\n✅ Python: \${pyPath}\`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(\`📋 Actions: \${jsonPath}\`);

    return listings;
  } catch (err) {
    console.error("\\n❌ Error:", err.message);
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
