"""Playwright script (Python) — The Trainline"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class TrainlineRequest:
    origin: str = "London"
    destination: str = "Paris"
    max_results: int = 5

@dataclass
class TrainItem:
    operator: str = ""
    departure: str = ""
    arrival: str = ""
    duration: str = ""
    price: str = ""

@dataclass
class TrainlineResult:
    trains: List[TrainItem] = field(default_factory=list)

def search_trainline(page: Page, request: TrainlineRequest) -> TrainlineResult:
    url = "https://www.thetrainline.com/"
    checkpoint("Navigate to Trainline")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    # Note: Trainline requires interactive form filling; minimal CDP version
    result = TrainlineResult()
    print("Trainline requires interactive search - use JS version for full functionality")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("trainline")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_trainline(page, TrainlineRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
