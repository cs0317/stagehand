const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  // Hostelworld search URL with Barcelona, 2 guests, dates 2 months out
  const today = new Date();
  const checkin = new Date(today.getFullYear(), today.getMonth() + 2, today.getDate());
  const checkout = new Date(checkin);
  checkout.setDate(checkout.getDate() + 2);
  const fmt = d => d.toISOString().split("T")[0];
  
  const url = "https://www.hostelworld.com/st/hostels/s?q=Barcelona,%20Spain&country=Spain&city=Barcelona&type=city&id=32&from=" + fmt(checkin) + "&to=" + fmt(checkout) + "&guests=2";
  
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 10000));

  console.log("Title:", await page.title());
  console.log("URL:", page.url());
  const text = await page.evaluate(() => document.body ? document.body.innerText : "EMPTY");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  console.log("Lines:", lines.length);
  for (let i = 0; i < Math.min(120, lines.length); i++) {
    console.log(i + ": " + lines[i].substring(0, 180));
  }

  await stagehand.close();
})();
