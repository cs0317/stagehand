const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "self-improvement", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://libro.fm/search?q=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { audiobooks } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} audiobook search results. For each audiobook get the title and author name.`,
      z.object({
        audiobooks: z.array(z.object({
          title: z.string().describe("The audiobook title"),
          author: z.string().describe("The author name"),
        })).describe("List of audiobook results"),
      })
    );

    const items = audiobooks.slice(0, CFG.maxResults).map(a => ({
      title: a.title,
      author: a.author,
      narrator: "",
      duration: "",
      price: "",
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
