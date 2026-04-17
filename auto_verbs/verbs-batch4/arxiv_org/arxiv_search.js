const fs = require("fs");
const path = require("path");

/**
 * arXiv – Recent Papers by Category
 *
 * The arXiv listing page has clean, stable semantic markup:
 *   dl#articles > dt (arxiv ID + pdf link) / dd (.list-title, .list-authors)
 * Abstracts are only on the per-paper /abs/<id> page under blockquote.abstract.
 *
 * Because the DOM is well-structured, no AI-driven exploration (Stagehand.act)
 * was required — selectors were discovered by direct HTML inspection.
 * This file documents the config and generates the Python Playwright script.
 */

const CFG = {
  listingUrl: "https://arxiv.org/list/cs.CR/recent",
  category: "cs.CR",
  maxResults: 5,
  absUrlTemplate: "https://arxiv.org/abs/{id}",
  pdfUrlTemplate: "https://arxiv.org/pdf/{id}",
  waits: { page: 2000, abstract: 1500 },
  selectors: {
    listItems: "dl#articles > dt",
    listDesc: "dl#articles > dd",
    arxivIdAnchor: 'a[href^="/abs/"]',
    pdfAnchor: 'a[href^="/pdf/"]',
    title: ".list-title",
    titleDescriptor: ".list-title .descriptor",
    authors: ".list-authors a",
    abstractBlock: "blockquote.abstract",
    abstractDescriptor: "blockquote.abstract .descriptor",
  },
};

function genPython(cfg) {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
arXiv – Recent Papers by Category
Category: ${cfg.category}

Generated on: ${ts}

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import os, sys, shutil, re
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    category: str = "${cfg.category}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Category:    {category}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("arxiv_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    papers = []

    try:
        listing_url = f"https://arxiv.org/list/{category}/recent"
        print(f"Loading listing: {listing_url}")
        page.goto(listing_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_selector("${cfg.selectors.listItems}", timeout=10000)
        page.wait_for_timeout(${cfg.waits.page})

        dts = page.locator("${cfg.selectors.listItems}")
        dds = page.locator("${cfg.selectors.listDesc}")
        total = min(dts.count(), dds.count(), max_results)
        print(f"  Found {dts.count()} entries on page; extracting top {total}.")

        # Pass 1: extract arxiv_id, title, authors, pdf_url from listing
        for i in range(total):
            dt = dts.nth(i)
            dd = dds.nth(i)

            id_anchor = dt.locator("${cfg.selectors.arxivIdAnchor}").first
            href = id_anchor.get_attribute("href") or ""
            arxiv_id = href.split("/abs/")[-1] if "/abs/" in href else ""

            # Title: strip the "Title:" descriptor prefix
            title_raw = dd.locator("${cfg.selectors.title}").first.inner_text(timeout=2000)
            title = re.sub(r"^\\s*Title:\\s*", "", title_raw).strip()

            author_links = dd.locator("${cfg.selectors.authors}")
            authors = [author_links.nth(k).inner_text(timeout=2000).strip()
                       for k in range(author_links.count())]

            pdf_anchor = dt.locator("${cfg.selectors.pdfAnchor}").first
            pdf_href = pdf_anchor.get_attribute("href") if pdf_anchor.count() > 0 else ""
            if pdf_href and not pdf_href.startswith("http"):
                pdf_url = f"https://arxiv.org{pdf_href}"
            elif arxiv_id:
                pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"
            else:
                pdf_url = ""

            papers.append({
                "arxiv_id": arxiv_id,
                "title": title,
                "authors": authors,
                "pdf_url": pdf_url,
                "abstract": "",
            })

        # Pass 2: visit each /abs/<id> to grab the abstract snippet
        for p in papers:
            if not p["arxiv_id"]:
                continue
            abs_url = f"https://arxiv.org/abs/{p['arxiv_id']}"
            page.goto(abs_url)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_selector("${cfg.selectors.abstractBlock}", timeout=10000)
            page.wait_for_timeout(${cfg.waits.abstract})
            abs_raw = page.locator("${cfg.selectors.abstractBlock}").first.inner_text(timeout=5000)
            p["abstract"] = re.sub(r"^\\s*Abstract:\\s*", "", abs_raw).strip()

        # Print
        print(f"\\nTop {len(papers)} latest papers in {category}:")
        for idx, p in enumerate(papers, 1):
            authors_preview = ", ".join(p["authors"][:3])
            if len(p["authors"]) > 3:
                authors_preview += f", … (+{len(p['authors']) - 3} more)"
            abstract_snippet = (p["abstract"][:200] + "…") if len(p["abstract"]) > 200 else p["abstract"]
            print(f"\\n  [{idx}] {p['title']}")
            print(f"      arXiv ID:  {p['arxiv_id']}")
            print(f"      Authors:   {authors_preview}")
            print(f"      PDF:       {p['pdf_url']}")
            print(f"      Abstract:  {abstract_snippet}")

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

    return papers


if __name__ == "__main__":
    with sync_playwright() as playwright:
        results = run(playwright)
        print(f"\\n--- Summary ---")
        print(f"  Retrieved {len(results)} papers.")
`;
}

if (require.main === module) {
  const out = genPython(CFG);
  const pyPath = path.join(__dirname, "arxiv_search.py");
  fs.writeFileSync(pyPath, out);
  console.log(`Wrote ${pyPath}`);
}

module.exports = { CFG, genPython };
