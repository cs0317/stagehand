const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { pokemon: "pikachu" };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://pokemondb.net/pokedex/${CFG.pokemon}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(3000);

    const { info } = await stagehand.extract(
      `Extract Pikachu's info: name, Pokedex number, type(s), abilities, base stats (HP, Attack, Defense, Sp. Atk, Sp. Def, Speed), and evolution chain.`,
      z.object({
        info: z.object({
          name: z.string().describe("Pokemon name"),
          pokedex_number: z.string().describe("National Pokedex number"),
          types: z.string().describe("Type(s)"),
          abilities: z.string().describe("Abilities"),
          hp: z.string().describe("Base HP"),
          attack: z.string().describe("Base Attack"),
          defense: z.string().describe("Base Defense"),
          sp_atk: z.string().describe("Base Sp. Atk"),
          sp_def: z.string().describe("Base Sp. Def"),
          speed: z.string().describe("Base Speed"),
          evolution_chain: z.string().describe("Evolution chain"),
        }),
      })
    );

    recorder.record("extract", { results: info });
    console.log("Extracted:", JSON.stringify(info, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
