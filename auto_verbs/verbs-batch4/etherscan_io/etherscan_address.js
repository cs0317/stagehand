/**
 * Etherscan – Ethereum Address Lookup
 *
 * Prompt:
 *   Search for an Ethereum address (vitalik.eth).
 *   Extract address, ETH balance, USD value, and 5 most recent transactions.
 *
 * Strategy:
 *   Direct URL: etherscan.io/address/<address>
 *   Then use Stagehand extract.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

/* ── config ──────────────────────────────────────────────── */
const CFG = {
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  maxTxns: 5,
};

/* ── main ────────────────────────────────────────────────── */
(async () => {
  const llmClient = setupLLMClient("copilot");

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    },
  });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    // ── Navigate to Etherscan address page ───────────────────
    const url = `https://etherscan.io/address/${CFG.address}`;
    console.log(`🌐 Navigating to: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check for bot detection ──────────────────────────────
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied") || bodyText.includes("Cloudflare")) {
      console.log("🚫 Bot detection triggered. Stopping.");
      process.exit(1);
    }

    // ── DOM exploration ──────────────────────────────────────
    console.log("\n🔍 Exploring DOM structure...");
    const domInfo = await page.evaluate(() => {
      const info = {};

      // Look for balance, value sections
      const balanceEls = document.querySelectorAll('#ContentPlaceHolder1_divSummary [id*="balance"], [id*="Balance"], .card-body');
      info.balanceElements = Array.from(balanceEls).slice(0, 5).map(el => ({
        tag: el.tagName,
        id: el.id,
        text: el.textContent.trim().substring(0, 200),
      }));

      // Transaction table rows
      const txRows = document.querySelectorAll('table tbody tr');
      info.txRowCount = txRows.length;
      info.firstTxRows = Array.from(txRows).slice(0, 3).map(tr => ({
        text: tr.innerText.trim().substring(0, 300),
        cellCount: tr.querySelectorAll('td').length,
      }));

      // Check for specific IDs
      const ethBalance = document.getElementById('ContentPlaceHolder1_divSummary');
      info.summaryText = ethBalance ? ethBalance.innerText.trim().substring(0, 500) : 'N/A';

      return info;
    });

    console.log("\n════ DOM STRUCTURE ════");
    console.log(`Summary section:\n${domInfo.summaryText}`);
    console.log(`\nTransaction rows: ${domInfo.txRowCount}`);
    if (domInfo.firstTxRows) {
      domInfo.firstTxRows.forEach((row, i) => {
        console.log(`\n--- TX Row ${i} (${row.cellCount} cells) ---`);
        console.log(`  ${row.text.substring(0, 200)}`);
      });
    }

    // ── Extract using Stagehand ──────────────────────────────
    console.log(`\n🎯 Extracting address info and ${CFG.maxTxns} transactions...`);

    const addressData = await stagehand.extract(
      `Extract the Ethereum address overview from this Etherscan page: the ETH balance, the USD value of holdings.`,
      z.object({
        eth_balance: z.string(),
        usd_value: z.string(),
      })
    );

    console.log(`\n✅ Address overview:`);
    console.log(`  ETH Balance: ${addressData.eth_balance}`);
    console.log(`  USD Value: ${addressData.usd_value}`);

    const txData = await stagehand.extract(
      `Extract the first ${CFG.maxTxns} transactions from the transaction list on this Etherscan page. For each get: transaction hash, from address, to address, value in ETH, and timestamp/age.`,
      z.object({
        transactions: z.array(z.object({
          tx_hash: z.string(),
          from_address: z.string(),
          to_address: z.string(),
          value: z.string(),
          timestamp: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${txData.transactions.length} transactions:`);
    txData.transactions.forEach((tx, i) => {
      console.log(`  ${i + 1}. ${tx.tx_hash}`);
      console.log(`     From: ${tx.from_address}  To: ${tx.to_address}`);
      console.log(`     Value: ${tx.value}  Time: ${tx.timestamp}`);
    });

    // ── Save recorded actions ────────────────────────────────
    const actionsPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`\n📋 Recorded actions: ${actionsPath}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
