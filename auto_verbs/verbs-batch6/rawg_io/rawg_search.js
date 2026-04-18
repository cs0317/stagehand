// Auto-generated – RAWG – Video Game Search
// Stub: full logic is in rawg_search.py

const { Stagehand } = require("@browserbasehq/stagehand");

async function rawgSearch() {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.google.com/search?q=site%3Arawg.io+best+RPG+games+2024");
  const results = await stagehand.extract("extract search result titles and URLs");
  console.log(results);
  await stagehand.close();
}

rawgSearch().catch(console.error);
