const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "machine learning career", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.quora.com/search?q=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { questions } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} questions. For each get: question text, number of answers, number of followers, top answer author, and top answer upvote count.`,
      z.object({
        questions: z.array(z.object({
          question: z.string().describe("Question text"),
          num_answers: z.string().describe("Number of answers"),
          followers: z.string().describe("Number of followers"),
          top_answer_author: z.string().describe("Top answer author name"),
          top_answer_upvotes: z.string().describe("Top answer upvote count"),
        })),
      })
    );

    const items = questions.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
