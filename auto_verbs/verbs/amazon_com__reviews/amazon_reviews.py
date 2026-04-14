"""
Amazon.com – Product Reviews
Search for a product, click the first result, extract customer reviews.

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "wireless earbuds",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max reviews: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("amazon_com_reviews")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []
    product_name = "N/A"

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading Amazon.com...")
        page.goto("https://www.amazon.com")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── Dismiss popups ────────────────────────────────────────────────
        for selector in [
            "#sp-cc-accept",
            "input[data-action-type='DISMISS']",
            "button:has-text('Accept')",
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

        # ── STEP 1: Search ────────────────────────────────────────────────
        print(f'STEP 1: Search for "{query}"...')
        search_input = page.locator('#twotabsearchtextbox').first
        search_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(query, delay=50)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        print(f'  Typed "{query}" and pressed Enter')
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(4000)

        # ── STEP 2: Click first result ────────────────────────────────────
        print("STEP 2: Click the first search result...")
        first_result = page.locator(
            "[data-component-type='s-search-result'] [data-cy='title-recipe'] a[href^='/']"
        ).first
        first_result.wait_for(state="visible", timeout=10000)
        product_name = first_result.inner_text(timeout=5000).strip()
        href = first_result.get_attribute("href")
        # Navigate directly to avoid new-tab / click interception issues
        product_url = f"https://www.amazon.com{href}"
        page.goto(product_url)
        print(f'  Navigated to: "{product_name}"')
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(4000)

        # ── STEP 3: Scroll to reviews on product page ─────────────────
        print("STEP 3: Scroll to customer reviews section...")
        # Extract reviews directly from the product page (navigating to
        # the dedicated reviews page may require sign-in).
        page.evaluate("""() => {
            const el = document.getElementById('reviewsMedley')
                    || document.getElementById('customer_review_section')
                    || document.querySelector('[data-hook="review"]');
            if (el) el.scrollIntoView({behavior: 'smooth'});
            else window.scrollBy(0, 3000);
        }""")
        page.wait_for_timeout(2000)

        # ── STEP 4: Extract reviews ───────────────────────────────────────
        print(f"STEP 4: Extract up to {max_results} reviews...")

        review_cards = page.locator('[data-hook="review"]')
        count = review_cards.count()
        print(f"  Found {count} review cards")

        for i in range(count):
            if len(results) >= max_results:
                break
            card = review_cards.nth(i)
            try:
                star_rating = "N/A"
                title = "N/A"
                review_text = "N/A"

                # Star rating
                try:
                    star_el = card.locator(
                        '[data-hook="review-star-rating"] .a-icon-alt, '
                        '[data-hook="cmps-review-star-rating"] .a-icon-alt'
                    ).first
                    star_text = star_el.inner_text(timeout=2000).strip()
                    sm = re.search(r"([\d.]+) out of", star_text)
                    if sm:
                        star_rating = sm.group(1)
                except Exception:
                    pass

                # Review title
                try:
                    title_el = card.locator(
                        '[data-hook="review-title"] span, '
                        '[data-hook="review-title"]'
                    ).first
                    title = title_el.inner_text(timeout=2000).strip()
                    # Remove rating prefix if present
                    title = re.sub(r'^\d+\.\d+ out of \d+ stars\s*', '', title).strip()
                except Exception:
                    pass

                # Review text
                try:
                    text_el = card.locator('[data-hook="review-body"] span').first
                    review_text = text_el.inner_text(timeout=2000).strip()
                    # Truncate long reviews
                    if len(review_text) > 300:
                        review_text = review_text[:300] + "..."
                except Exception:
                    pass

                if title == "N/A" and review_text == "N/A":
                    continue

                results.append({
                    "star_rating": star_rating,
                    "title": title,
                    "review_text": review_text,
                })
                print(f"  {len(results)}. [{star_rating} stars] {title}")

            except Exception as e:
                print(f"  Error on review {i}: {e}")
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nFound {len(results)} reviews for '{query}' — Product: {product_name}")
        for i, r in enumerate(results, 1):
            print(f"  {i}. [{r['star_rating']} stars] {r['title']}")
            print(f"     {r['review_text'][:120]}...")

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
        print(f"\nTotal reviews found: {len(items)}")
