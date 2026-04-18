// Auto-generated – Poshmark – Fashion Listing Search
// Stub: full logic is in poshmark_search.py

const { Stagehand } = require("@browserbasehq/stagehand");

async function poshmarkSearch() {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.google.com/search?q=site%3Aposhmark.com+designer+handbag+Louis+Vuitton");
  const results = await stagehand.extract("extract search result titles and URLs");
  console.log(results);
  await stagehand.close();
}

poshmarkSearch().catch(console.error);
