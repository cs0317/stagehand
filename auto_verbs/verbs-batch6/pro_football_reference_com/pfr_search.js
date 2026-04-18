// Auto-generated – Pro Football Reference – NFL Player Stats Search
// Stub: full logic is in pfr_search.py

const { Stagehand } = require("@browserbasehq/stagehand");

async function pfrSearch() {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.google.com/search?q=site%3Apro-football-reference.com+Patrick+Mahomes+career+stats");
  const results = await stagehand.extract("extract search result titles and URLs");
  console.log(results);
  await stagehand.close();
}

pfrSearch().catch(console.error);
