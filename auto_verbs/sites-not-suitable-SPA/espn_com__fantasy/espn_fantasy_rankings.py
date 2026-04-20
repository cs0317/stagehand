"""
Playwright script (Python) — ESPN Fantasy Football Rankings
Browse ESPN Fantasy Football player rankings.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class EspnFantasyRequest:
    max_results: int = 10


@dataclass
class PlayerRankingItem:
    rank: str = ""
    name: str = ""
    team: str = ""
    position: str = ""
    projected_points: str = ""


@dataclass
class EspnFantasyResult:
    items: List[PlayerRankingItem] = field(default_factory=list)


def get_espn_fantasy_rankings(page: Page, request: EspnFantasyRequest) -> EspnFantasyResult:
    """Browse ESPN Fantasy Football player rankings."""
    url = "https://www.espn.com/fantasy/football/story/_/id/36631158/fantasy-football-rankings-2024"
    print(f"Loading {url}...")
    checkpoint("Navigate to rankings")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = EspnFantasyResult()

    checkpoint("Extract player rankings")
    js_code = """(max) => {
        const items = [];
        const rows = document.querySelectorAll('table tr, [class*="Table"] tr');
        for (const row of rows) {
            if (items.length >= max) break;
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) continue;
            const text = (row.textContent || '').replace(/\\s+/g, ' ').trim();

            let rank = '';
            const rankMatch = text.match(/^(\\d+)\\s/);
            if (rankMatch) rank = rankMatch[1];
            if (!rank) {
                const firstCell = cells[0]?.textContent?.trim();
                if (/^\\d+$/.test(firstCell)) rank = firstCell;
            }

            let name = cells[1]?.textContent?.trim() || cells[0]?.textContent?.trim() || '';
            if (!name || name.length < 2) continue;

            let team = '', position = '';
            const tpMatch = text.match(/([A-Z]{2,3})\\s+(QB|RB|WR|TE|K|D\\/ST|DEF)/i);
            if (tpMatch) { team = tpMatch[1]; position = tpMatch[2]; }

            let projPoints = '';
            const ptMatch = text.match(/(\\d+\\.?\\d*)\\s*(?:pts|points)?$/i);
            if (ptMatch) projPoints = ptMatch[1];

            items.push({rank, name: name.substring(0, 80), team, position, projected_points: projPoints});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = PlayerRankingItem()
        item.rank = d.get("rank", "")
        item.name = d.get("name", "")
        item.team = d.get("team", "")
        item.position = d.get("position", "")
        item.projected_points = d.get("projected_points", "")
        result.items.append(item)

    print(f"\\nFound {len(result.items)} ranked players:")
    for i, item in enumerate(result.items, 1):
        print(f"  {item.rank}. {item.name} ({item.team} {item.position}) - {item.projected_points} pts")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("espn_fantasy")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = get_espn_fantasy_rankings(page, EspnFantasyRequest())
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} players")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
