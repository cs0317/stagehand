const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  artist: "Radiohead",
  maxTracks: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  return `# See artist_lookup.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const slug = encodeURIComponent(CFG.artist);
    await page.goto(`https://www.last.fm/music/${slug}`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "artist_lookup", "Navigate to Last.fm artist page");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract artist name, total listeners, total scrobbles, bio snippet, and top ${CFG.maxTracks} tracks with play counts.`
    );
    recorder.record("extract", "artist_info", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "artist_lookup.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
