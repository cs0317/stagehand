// Auto-generated – Google Scholar – Academic Paper Search
// Stub: full logic is in scholar_search.py

const { Stagehand } = require("@browserbasehq/stagehand");

async function scholarSearch() {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://scholar.google.com/scholar?q=deep+learning+neural+networks");
  const results = await stagehand.extract("extract search result titles and URLs");
  console.log(results);
  await stagehand.close();
}

scholarSearch().catch(console.error);
