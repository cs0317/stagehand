const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
    localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled", "--start-maximized"] }
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.asos.com/search/?q=mens+jackets", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  const structure = await page.evaluate(() => {
    const checks = {};
    const sels = ["div[data-auto-id]", "a[href*='/prd/']", "section", "section > div", "div[class*=product]", "div[class*=card]"];
    for (const sel of sels) {
      checks[sel] = document.querySelectorAll(sel).length;
    }
    const autoIds = new Set();
    document.querySelectorAll("[data-auto-id]").forEach(el => autoIds.add(el.getAttribute("data-auto-id")));

    // Find product links and inspect parent structure
    const productLinks = document.querySelectorAll("a[href*='/prd/']");
    let firstProductHTML = "none";
    if (productLinks.length > 0) {
      // Walk up to find the product card container
      let el = productLinks[0];
      for (let i = 0; i < 5; i++) {
        if (el.parentElement) el = el.parentElement;
      }
      firstProductHTML = el.outerHTML.substring(0, 3000);
    }

    // Get individual product card details
    const productCards = document.querySelectorAll("li[id^='product-']");
    const cardDetails = [];
    for (let i = 0; i < Math.min(3, productCards.length); i++) {
      const card = productCards[i];
      const link = card.querySelector("a[href*='/prd/']");
      const ariaLabel = link ? link.getAttribute("aria-label") : null;
      // Look for sub-elements
      const innerText = card.innerText;
      cardDetails.push({ id: card.id, ariaLabel, innerText: innerText.substring(0, 300), innerHTML: card.innerHTML.substring(0, 1500) });
    }
    return { checks, autoIds: [...autoIds], productLinksCount: productLinks.length, cardDetails, cardCount: productCards.length };
  });
  console.log("Selector counts:", JSON.stringify(structure.checks, null, 2));
  console.log("data-auto-id values:", JSON.stringify(structure.autoIds));
  console.log("Product links count:", structure.productLinksCount);
  console.log("Cards with li[id^=product-]:", structure.cardCount);
  console.log("\nCard details:");
  structure.cardDetails.forEach((c, i) => {
    console.log(`\n--- Card ${i} ---`);
    console.log("ID:", c.id);
    console.log("aria-label:", c.ariaLabel);
    console.log("innerText:", c.innerText);
    console.log("innerHTML:", c.innerHTML);
  });

  await stagehand.close();
  process.exit(0);
})();
