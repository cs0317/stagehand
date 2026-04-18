// Auto-generated – ProPublica – Investigative Article Search
// Stub: full logic is in propublica_search.py

const { Stagehand } = require("@browserbasehq/stagehand");

async function propublicaSearch() {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.google.com/search?q=site%3Apropublica.org+government+spending+investigation");
  const results = await stagehand.extract("extract search result titles and URLs");
  console.log(results);
  await stagehand.close();
}

propublicaSearch().catch(console.error);
