const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { category: "Cooking", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://www.masterclass.com/categories/cooking";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    recorder.goto(url);
    await page.waitForTimeout(10000);
    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.waitForTimeout(3000);

    const { classes } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} cooking classes shown. For each get the instructor name, class title, number of lessons, total runtime, and description.`,
      z.object({
        classes: z.array(z.object({
          instructor: z.string().describe("Instructor name"),
          title: z.string().describe("Class title"),
          lessons: z.string().describe("Number of lessons"),
          runtime: z.string().describe("Total runtime"),
          description: z.string().describe("Class description"),
        })),
      })
    );

    const items = classes.slice(0, CFG.maxResults).map(c => ({
      instructor: c.instructor,
      title: c.title,
      lessons: c.lessons,
      runtime: c.runtime,
      description: c.description,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
