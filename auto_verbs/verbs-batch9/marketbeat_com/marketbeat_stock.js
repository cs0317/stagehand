const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { ticker: "AAPL" };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.marketbeat.com/stocks/NASDAQ/${CFG.ticker}/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    // Scroll down to load more data
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(2000);

    const { stock } = await stagehand.extract(
      `Extract the stock information for ${CFG.ticker}. Get the current price, market cap, P/E ratio, dividend yield, 52-week high, 52-week low, and analyst consensus rating.`,
      z.object({
        stock: z.object({
          ticker: z.string().describe("Stock ticker symbol"),
          price: z.string().describe("Current stock price"),
          market_cap: z.string().describe("Market capitalization"),
          pe_ratio: z.string().describe("P/E ratio"),
          dividend_yield: z.string().describe("Dividend yield"),
          high_52w: z.string().describe("52-week high"),
          low_52w: z.string().describe("52-week low"),
          analyst_rating: z.string().describe("Analyst consensus rating"),
        }),
      })
    );

    const item = {
      ticker: stock.ticker,
      price: stock.price,
      market_cap: stock.market_cap,
      pe_ratio: stock.pe_ratio,
      dividend_yield: stock.dividend_yield,
      high_52w: stock.high_52w,
      low_52w: stock.low_52w,
      analyst_rating: stock.analyst_rating,
    };

    recorder.record("extract", { result: item });
    console.log("Extracted:", JSON.stringify(item, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
