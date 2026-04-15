const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.chewy.com/s?rh=c%3A288&query=dog+food+grain+free");
  await page.waitForLoadState("domcontentloaded");
  await new Promise(r => setTimeout(r, 8000));
  
  const info = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="ProductCard"]');
    return Array.from(cards).slice(0, 3).map(card => {
      const brand = card.querySelector('[class*="brand"], [class*="Brand"]');
      const name = card.querySelector('[class*="name"], [class*="Name"], [class*="title"], [class*="Title"]');
      const rating = card.querySelector('[class*="Rating"], [class*="rating"]');
      const price = card.querySelector('[class*="price"], [class*="Price"]');
      return {
        brandText: brand ? brand.innerText.trim() : "no brand",
        nameText: name ? name.innerText.trim() : "no name",
        ratingText: rating ? rating.innerText.trim() : "no rating",
        priceText: price ? price.innerText.trim().substring(0, 60) : "no price",
        attrs: Array.from(card.querySelectorAll("[data-testid]")).slice(0, 5).map(e => e.getAttribute("data-testid") + ": " + e.innerText.substring(0, 50)),
      };
    });
  });
  info.forEach((card, i) => {
    console.log((i+1) + ". Brand: " + card.brandText);
    console.log("   Name: " + card.nameText);
    console.log("   Rating: " + card.ratingText);
    console.log("   Price: " + card.priceText);
    console.log("   Attrs: " + JSON.stringify(card.attrs));
    console.log();
  });
  
  // Also check text for non-sponsored items
  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split("\n").filter(l => l.trim());
  // Find non-sponsored items
  let nonSponsoredStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("grain") && !lines[i].includes("Sponsored") && lines[i].length > 30) {
      nonSponsoredStart = i;
      break;
    }
  }
  if (nonSponsoredStart > 0) {
    console.log("=== Non-sponsored content starts around line " + nonSponsoredStart + " ===");
    lines.slice(nonSponsoredStart, nonSponsoredStart + 50).forEach((l, i) => 
      console.log("[" + (nonSponsoredStart + i) + "] " + l.substring(0, 140))
    );
  }
  
  await stagehand.close();
})();
