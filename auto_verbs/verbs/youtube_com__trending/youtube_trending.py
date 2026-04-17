"""
Auto-generated Playwright script (Python)
YouTube – Trending Videos
Extract up to 10 trending videos with title, channel, views, upload time.

Generated on: 2026-04-16T18:42:03.940Z
Recorded 3 browser interactions

Uses Playwright's native locator API with CDP connection to real Chrome.
"""

import re
import os
import sys
import shutil
import json
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import Playwright, sync_playwright


# ── Inline CDP utilities (no external dependency) ────────────────────────────

def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get_temp_profile_dir(site: str = "default") -> str:
    tmp = os.path.join(tempfile.gettempdir(), f"{site}_chrome_profile_{os.getpid()}")
    os.makedirs(tmp, exist_ok=True)
    return tmp


def find_chrome_executable() -> str:
    for candidate in [
        os.environ.get("CHROME_PATH", ""),
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
    ]:
        if candidate and os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError("Could not find Chrome/Chromium.")


def launch_chrome(profile_dir: str, port: int, headless: bool = False) -> subprocess.Popen:
    chrome_path = find_chrome_executable()
    flags = [
        chrome_path,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "--remote-allow-origins=*",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-blink-features=AutomationControlled",
        "--disable-extensions",
        "--disable-component-extensions-with-background-pages",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--mute-audio",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
        "--disable-infobars",
        "--no-sandbox",
        "--window-size=1280,987",
        "about:blank",
    ]
    if headless:
        flags.insert(1, "--headless=new")
    return subprocess.Popen(flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wait_for_cdp_ws(port: int, timeout_s: float = 15.0) -> str:
    deadline = time.time() + timeout_s
    last_err = ""
    while time.time() < deadline:
        try:
            resp = urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2)
            data = json.loads(resp.read())
            ws_url = data.get("webSocketDebuggerUrl", "")
            if ws_url:
                return ws_url
        except Exception as e:
            last_err = str(e)
        time.sleep(0.25)
    raise TimeoutError(f"Timed out waiting for Chrome CDP on port {port}: {last_err}")


# ── Main extraction function ─────────────────────────────────────────────────

def extract_trending_videos(
    playwright: Playwright,
    max_results: int = 10,
) -> list[dict]:
    """
    Navigate to YouTube Trending and extract video listings.

    Parameters:
        max_results: Maximum number of trending videos to extract.

    Returns:
        List of dicts with keys: title, channel_name, view_count, upload_time.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("youtube_trending")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to Trending ──────────────────────────────────────────
        trending_url = "https://www.youtube.com/feed/trending"
        print(f"Loading {trending_url}...")
        page.goto(trending_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        current_url = page.url
        print(f"  Loaded: {current_url}")

        if "trending" not in current_url:
            # Trending page may require sign-in; fall back to search
            print("  Trending page not accessible, using search fallback...")
            search_url = "https://www.youtube.com/results?search_query=trending+today&sp=CAI%253D"
            page.goto(search_url)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(3000)
            print(f"  Loaded search: {page.url}")

        # ── Dismiss cookie / consent dialogs ──────────────────────────────
        for selector in [
            'button[aria-label="Accept all"]',
            'button[aria-label="Accept the use of cookies and other data for the purposes described"]',
            'button:has-text("Accept all")',
            'button:has-text("Reject all")',
            'tp-yt-paper-dialog button#button',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # Wait for video content to load
        page.wait_for_timeout(2000)

        # ── Extract trending videos ──────────────────────────────────────
        print(f"Extracting up to {max_results} trending videos...")

        # YouTube trending uses ytd-video-renderer or ytd-expanded-shelf-contents-renderer
        video_renderers = page.locator("ytd-video-renderer")
        count = video_renderers.count()
        print(f"  Found {count} video renderers")

        seen_titles = set()
        for i in range(count):
            if len(results) >= max_results:
                break
            renderer = video_renderers.nth(i)
            try:
                # Title
                title = "N/A"
                try:
                    title_el = renderer.locator("#video-title").first
                    title = title_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                if title == "N/A" or title.lower() in seen_titles:
                    continue
                seen_titles.add(title.lower())

                # Channel name
                channel_name = "N/A"
                try:
                    channel_el = renderer.locator(
                        "ytd-channel-name a, "
                        "#channel-name a, "
                        "#channel-name #text"
                    ).first
                    channel_name = channel_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Metadata line: views and upload time
                view_count = "N/A"
                upload_time = "N/A"
                try:
                    meta_el = renderer.locator("#metadata-line span.inline-metadata-item")
                    meta_count = meta_el.count()
                    for mi in range(meta_count):
                        text = meta_el.nth(mi).inner_text(timeout=1000).strip()
                        if "view" in text.lower():
                            view_count = text
                        elif "ago" in text.lower() or "hour" in text.lower() or "day" in text.lower() or "week" in text.lower():
                            upload_time = text
                except Exception:
                    pass

                results.append({
                    "title": title,
                    "channel_name": channel_name,
                    "view_count": view_count,
                    "upload_time": upload_time,
                })
            except Exception:
                continue

        # ── Fallback: regex on page text ──────────────────────────────────
        if not results:
            print("  Renderer extraction failed, trying text fallback...")
            body_text = page.evaluate("document.body.innerText") or ""
            lines = body_text.split("\n")
            for i, line in enumerate(lines):
                if len(results) >= max_results:
                    break
                view_match = re.search(r"([\d,.]+[KMB]?)\s*views?", line, re.IGNORECASE)
                if view_match and len(line.strip()) < 200:
                    # Look backward for title
                    title = "N/A"
                    channel = "N/A"
                    for j in range(max(0, i - 5), i):
                        cand = lines[j].strip()
                        if cand and len(cand) > 5 and "view" not in cand.lower():
                            if title == "N/A":
                                title = cand
                            else:
                                channel = cand
                    # Look for time ago
                    upload_time = "N/A"
                    time_match = re.search(r"(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)", line, re.IGNORECASE)
                    if time_match:
                        upload_time = time_match.group(1)

                    if title != "N/A":
                        results.append({
                            "title": title,
                            "channel_name": channel,
                            "view_count": view_match.group(0),
                            "upload_time": upload_time,
                        })

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nFound {len(results)} trending videos:")
        for i, vid in enumerate(results, 1):
            print(f"  {i}. {vid['title']}")
            print(f"     Channel: {vid['channel_name']}  Views: {vid['view_count']}  Uploaded: {vid['upload_time']}")

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
        items = extract_trending_videos(playwright)
        print(f"\nTotal trending videos found: {len(items)}")
