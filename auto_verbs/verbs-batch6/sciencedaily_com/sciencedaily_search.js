// Auto-generated – ScienceDaily – Science News Search
// Stub: full logic is in sciencedaily_search.py

const { Stagehand } = require("@browserbasehq/stagehand");

async function sciencedailySearch() {
  const stagehand = new Stagehand({ env: "LOCAL" });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.google.com/search?q=site%3Asciencedaily.com+artificial+intelligence+healthcare");
  const results = await stagehand.extract("extract search result titles and URLs");
  console.log(results);
  await stagehand.close();
}

sciencedailySearch().catch(console.error);
