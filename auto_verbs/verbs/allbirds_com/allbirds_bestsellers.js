const fs = require("fs");
const path = require("path");

/**
 * Allbirds – Best Sellers
 *
 * Allbirds is a Shopify-based SPA (window.Shopify present). Curl returns
 * the app shell only — products render client-side — so selector discovery
 * was done via a short Playwright reconnaissance against the rendered DOM.
 *
 * The best-sellers collection page lists products as:
 *   a[href^="/products/"]
 *     div.aspect-square img[alt="<product name>"]
 *     p (truncate)   → product name
 *     span.line-through → compare-at price
 *     span (last)       → current price
 *
 * Anchors are stable; the img[alt] attribute is a reliable anchor for the
 * product name (accessibility requirement).
 */

const CFG = {
  url: "https://www.allbirds.com/collections/best-sellers",
  maxResults: 5,
  waits: { page: 2000 },
  selectors: {
    card: 'a[href^="/products/"]',
    img: "img[alt]",
    priceSpans: "span",
  },
};

function genPython(cfg) {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
Allbirds – Best Sellers

Generated on: ${ts}

Uses Playwright via CDP connection with the user's Chrome profile.
"""

# (see allbirds_bestsellers.py for the final typed verb)
`;
}

if (require.main === module) {
  const out = genPython(CFG);
  console.log(out);
}

module.exports = { CFG, genPython };
