// Auto-generated – PLOS – Scientific Article Search
// Stub: full logic is in plos_search.py

const { Stagehand } = require("@browserbasehq/stagehand");

async function plosSearch() {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.google.com/search?q=site%3Aplos.org+climate+change+impact+ocean");
  const results = await stagehand.extract("extract search result titles and URLs");
  console.log(results);
  await stagehand.close();
}

plosSearch().catch(console.error);
