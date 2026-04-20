const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { maxResults: 10 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://www.espn.com/fantasy/football/story/_/id/36631158/fantasy-football-rankings-2024";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const rows = document.querySelectorAll('table tr, [class*="Table"] tr');
      for (const row of rows) {
        if (results.length >= max) break;
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;
        const text = (row.textContent || '').replace(/\s+/g, ' ').trim();
        
        let rank = '';
        const rankMatch = text.match(/^(\d+)\s/);
        if (rankMatch) rank = rankMatch[1];
        if (!rank) {
          const firstCell = cells[0]?.textContent?.trim();
          if (/^\d+$/.test(firstCell)) rank = firstCell;
        }

        let name = cells[1]?.textContent?.trim() || cells[0]?.textContent?.trim() || '';
        if (!name || name.length < 2) continue;

        let team = '', position = '';
        const tpMatch = text.match(/([A-Z]{2,3})\s+(QB|RB|WR|TE|K|D\/ST|DEF)/i);
        if (tpMatch) { team = tpMatch[1]; position = tpMatch[2]; }

        let projPoints = '';
        const ptMatch = text.match(/(\d+\.?\d*)\s*(?:pts|points)?$/i);
        if (ptMatch) projPoints = ptMatch[1];

        results.push({ rank, name: name.substring(0, 80), team, position, projected_points: projPoints });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
