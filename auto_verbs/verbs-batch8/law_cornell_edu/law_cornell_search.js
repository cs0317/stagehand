const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  search_query: "first amendment",
  max_results: 5,
};

async function genPython(cfg, recorder) {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    enableCaching: false,
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  const url = `https://www.law.cornell.edu/search?q=${encodeURIComponent(cfg.search_query)}`;
  recorder.recordNav(url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  recorder.recordExtract(
    "extract search results",
    [
      "title",
      "code_section",
      "jurisdiction",
      "summary",
      "url",
    ],
    cfg.max_results
  );

  const results = await stagehand.extract(
    `Extract up to ${cfg.max_results} legal resource results from the search page. For each result extract: title, code_section (the code or section number like "42 U.S.C. § 1983"), jurisdiction (e.g. Federal, U.S. Constitution), summary (brief description), and url (link to the resource).`,
    {
      schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                code_section: { type: "string" },
                jurisdiction: { type: "string" },
                summary: { type: "string" },
                url: { type: "string" },
              },
            },
          },
        },
      },
    }
  );

  console.log(JSON.stringify(results, null, 2));

  await stagehand.close();
  return results;
}

(async () => {
  const recorder = new PlaywrightRecorder();
  await genPython(CFG, recorder);
  const pyCode = recorder.toPythonScript("law_cornell_search");
  const outPath = path.join(__dirname, "law_cornell_search.py");
  fs.writeFileSync(outPath, pyCode);
  console.log(`Wrote ${outPath}`);
})();
