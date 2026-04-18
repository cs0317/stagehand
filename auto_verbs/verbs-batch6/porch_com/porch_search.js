// Auto-generated – Porch – Home Service Search
// Stub: full logic is in porch_search.py

const { Stagehand } = require("@browserbasehq/stagehand");

async function porchSearch() {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.google.com/search?q=site%3Aporch.com+plumber+near+me+reviews");
  const results = await stagehand.extract("extract search result titles and URLs");
  console.log(results);
  await stagehand.close();
}

porchSearch().catch(console.error);
