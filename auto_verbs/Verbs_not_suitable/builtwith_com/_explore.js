const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
    localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled","--start-maximized"] }
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  await page.goto("https://builtwith.com/github.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(8000);
  console.log("URL:", page.url());

  const info = await page.evaluate(() => {
    const bodyText = document.body.innerText || "";
    const lines = bodyText.split("\n").filter(l => l.trim()).slice(0, 100);
    
    // Look for technology groups
    const cards = document.querySelectorAll(".card, .tech-section, .panel, [class*=tech]");
    const h2s = Array.from(document.querySelectorAll("h2, h3, h6")).map(h => ({
      tag: h.tagName,
      text: h.textContent.trim().substring(0, 100),
      class: h.className.substring(0, 50),
      parentClass: h.parentElement?.className?.substring(0, 50) || "",
    }));
    
    return { lineCount: lines.length, lines: lines.slice(0, 80), cardCount: cards.length, headings: h2s.slice(0, 20) };
  });

  console.log("Cards:", info.cardCount, "Headings:", info.headings.length);
  console.log("\nHeadings:");
  info.headings.forEach(h => console.log(`  ${h.tag} (${h.class}): ${h.text}`));
  console.log("\nBody lines:");
  info.lines.forEach((l, i) => console.log(i + ": " + l.substring(0, 150)));

  await stagehand.close();
  process.exit(0);
})();
