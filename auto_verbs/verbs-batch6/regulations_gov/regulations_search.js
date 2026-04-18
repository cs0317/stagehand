// Auto-generated – Regulations.gov – Federal Regulation Search
// Stub: full logic is in regulations_search.py

const { Stagehand } = require("@browserbasehq/stagehand");

async function regulationsSearch() {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.google.com/search?q=site%3Aregulations.gov+environmental+protection+clean+water");
  const results = await stagehand.extract("extract search result titles and URLs");
  console.log(results);
  await stagehand.close();
}

regulationsSearch().catch(console.error);
