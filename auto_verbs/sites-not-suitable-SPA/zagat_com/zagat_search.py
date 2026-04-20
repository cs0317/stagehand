"""Playwright script (Python) — Zagat"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class ZagatRequest:
    location: str = "Los Angeles"
    max_results: int = 5

@dataclass
class RestaurantItem:
    name: str = ""
    cuisine: str = ""
    neighborhood: str = ""
    food_score: str = ""
    decor_score: str = ""
    service_score: str = ""
    price_range: str = ""

@dataclass
class ZagatResult:
    restaurants: List[RestaurantItem] = field(default_factory=list)

def search_zagat(page: Page, request: ZagatRequest) -> ZagatResult:
    url = "https://www.zagat.com/l/los-angeles/best-restaurants"
    checkpoint("Navigate to Zagat restaurants")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = ZagatResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="restaurant"], [class*="card"], article');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('h2, h3, [class*="name"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;
            const cuisineEl = card.querySelector('[class*="cuisine"], [class*="category"]');
            const cuisine = cuisineEl ? cuisineEl.textContent.trim() : '';
            const hoodEl = card.querySelector('[class*="neighborhood"], [class*="location"]');
            const neighborhood = hoodEl ? hoodEl.textContent.trim() : '';
            const priceEl = card.querySelector('[class*="price"]');
            const priceRange = priceEl ? priceEl.textContent.trim() : '';
            results.push({ name, cuisine, neighborhood, foodScore: '', decorScore: '', serviceScore: '', priceRange });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = RestaurantItem()
        item.name = d.get("name", "")
        item.cuisine = d.get("cuisine", "")
        item.neighborhood = d.get("neighborhood", "")
        item.price_range = d.get("priceRange", "")
        result.restaurants.append(item)
    print(f"Found {len(result.restaurants)} restaurants")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("zagat")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_zagat(page, ZagatRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
