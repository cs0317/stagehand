/**
 * HuggingFace – Search for local coding models under 9B parameters
 *
 * Prompt: Search for a local coding model with less than 9B parameters.
 *         Click each model to check Safetensor section for parameter count.
 *         Compose a list of up to 5 models (name + parameters).
 *
 * Uses AI-driven discovery to interact with HuggingFace's search and model pages.
 * Records interactions and generates a Python Playwright script.
 * Does not take any screenshots.
 */
const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { setupLLMClient, PlaywrightRecorder } = require("../../stagehand-utils");

const TIMEOUT = 600_000;
const _timer = setTimeout(() => { console.error("\n⏰ Global timeout"); process.exit(1); }, TIMEOUT);

function getTempProfileDir(site = "huggingface") {
  const tmp = path.join(os.tmpdir(), `${site}_chrome_profile_${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  const src = path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default");
  for (const f of ["Preferences", "Local State"]) {
    const s = path.join(src, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(tmp, f));
  }
  return tmp;
}

function genPython(results) {
  const ts = new Date().toISOString();
  const models = results || [];
  return `"""
HuggingFace – Search for local coding models under 9B parameters
Generated: ${ts}
Pure Playwright – no AI.
"""
import re, os, traceback, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, query: str = "code", max_results: int = 5) -> list:
    port = get_free_port()
    profile_dir = get_temp_profile_dir("huggingface_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    models = []
    try:
        print("STEP 1: Navigate to HuggingFace models page with coding filter...")
        page.goto(
            "https://huggingface.co/models?sort=trending&search=code",
            wait_until="domcontentloaded", timeout=30000,
        )
        page.wait_for_timeout(5000)

        # Dismiss cookie/popup banners
        for sel in ["button:has-text('Accept')", "button:has-text('Got it')", "button:has-text('Close')"]:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=500):
                    el.evaluate("el => el.click()")
            except Exception:
                pass
        page.wait_for_timeout(1000)

        print("STEP 2: Collect model links from search results...")
        # HuggingFace model cards are typically <a> tags linking to /<org>/<model>
        model_links = page.locator("a[href*='/'][class*=''],  article a, h4 a").all()
        # Filter to model detail links (e.g. /meta-llama/..., /Qwen/...)
        candidates = []
        seen = set()
        for link in model_links:
            try:
                href = link.get_attribute("href")
                text = link.inner_text(timeout=2000).strip()
                if (
                    href
                    and "/" in href
                    and not href.startswith("http")
                    and href.count("/") >= 1
                    and len(text) > 2
                    and text not in seen
                    and "code" in text.lower() or "coder" in text.lower() or "starcoder" in text.lower() or "deepseek" in text.lower()
                ):
                    seen.add(text)
                    candidates.append({"name": text, "href": href})
            except Exception:
                pass
            if len(candidates) >= 15:
                break

        print(f"  Found {len(candidates)} candidate model links")

        print("STEP 3: Visit each model page to check Safetensor section...")
        for cand in candidates:
            if len(models) >= max_results:
                break
            model_name = cand["name"]
            model_url = "https://huggingface.co" + cand["href"]
            print(f"  Checking: {model_name} ({model_url})")
            try:
                page.goto(model_url, wait_until="domcontentloaded", timeout=20000)
                page.wait_for_timeout(3000)

                body_text = page.locator("body").inner_text(timeout=10000)

                # Check if Safetensor section exists
                if "safetensor" not in body_text.lower():
                    print(f"    No Safetensor section found, skipping")
                    continue

                # Look for parameter count in the page text
                param_match = None
                for line in body_text.split("\\n"):
                    line_lower = line.lower().strip()
                    # Match patterns like "7B", "1.5B", "6.7B", "3B params", etc.
                    m = re.search(r"(\\d+\\.?\\d*)\\s*[Bb](?:\\s|$|\\s*param)", line_lower)
                    if m:
                        val = float(m.group(1))
                        if val < 9.0:
                            param_match = f"{m.group(1)}B"
                            break

                if param_match:
                    models.append({"model_name": model_name, "parameters": param_match})
                    print(f"    ✓ {model_name} — {param_match} (under 9B, has Safetensors)")
                else:
                    print(f"    Parameters not under 9B or not found, skipping")

            except Exception as e:
                print(f"    Error: {e}")
                continue

            page.wait_for_timeout(1000)

        print(f"\\nDONE – Models found ({len(models)}):")
        for i, m in enumerate(models, 1):
            print(f"  {i}. {m['model_name']} | {m['parameters']}")

    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)
    return models

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
`;
}

(async () => {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  HuggingFace – Coding Models Under 9B Parameters");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const llmClient = setupLLMClient("hybrid");
  const tmpProfile = getTempProfileDir();
  const stagehand = new Stagehand({
    env: "LOCAL", verbose: 0, llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      args: [`--user-data-dir=${tmpProfile}`, "--disable-blink-features=AutomationControlled"],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  const collectedModels = [];

  try {
    // ═══ Step 1: Navigate to HuggingFace models page ═══
    console.log("🔍 Navigating to HuggingFace models page...");
    await page.goto("https://huggingface.co/models?sort=trending&search=code", {
      waitUntil: "domcontentloaded", timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    recorder.record("goto", "Navigate to HuggingFace models search for 'code'");
    console.log(`📋 Landed on: ${page.url()}`);

    // Dismiss popups/cookie banners
    for (const s of ["button:has-text('Accept')", "button:has-text('Got it')", "button:has-text('Close')"]) {
      try {
        const el = page.locator(s).first();
        if (await el.isVisible({ timeout: 500 })) await el.click({ timeout: 1000 });
      } catch {}
    }
    await page.waitForTimeout(1_000);

    // ═══ Step 2: Use AI to extract model links from the search results ═══
    console.log("\n📋 Extracting model listing from search results...");

    const listingSchema = z.object({
      models: z.array(z.object({
        model_name: z.string().describe("Full model name including org, e.g. 'Qwen/Qwen2.5-Coder-7B'"),
        model_url: z.string().describe("Relative URL path to the model page, e.g. '/Qwen/Qwen2.5-Coder-7B'"),
      })).describe("Up to 15 coding models from search results"),
    });

    let candidates = [];
    try {
      const listing = await stagehand.extract(
        "Extract all model names and their relative URL paths from the model cards shown on this page. " +
        "Only include models that appear to be coding/code models. Get the full model name including the organization prefix (e.g. 'Qwen/Qwen2.5-Coder-7B'). " +
        "Get the relative URL path (e.g. '/Qwen/Qwen2.5-Coder-7B').",
        listingSchema,
      );
      if (listing?.models?.length > 0) {
        candidates = listing.models;
        console.log(`   ✅ Found ${candidates.length} candidate models`);
        candidates.forEach((m, i) => console.log(`      ${i + 1}. ${m.model_name}`));
      }
    } catch (e) {
      console.log(`   ⚠ Extract failed: ${e.message}`);
    }

    // Scroll down and try again if few results
    if (candidates.length < 5) {
      console.log("   Scrolling for more results...");
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(800);
      }
      try {
        const moreListing = await stagehand.extract(
          "Extract all model names and their relative URL paths from the model cards shown on this page. " +
          "Only include models that appear to be coding/code models. Get the full model name including the organization prefix.",
          listingSchema,
        );
        if (moreListing?.models?.length > 0) {
          const existingNames = new Set(candidates.map(c => c.model_name));
          for (const m of moreListing.models) {
            if (!existingNames.has(m.model_name)) {
              candidates.push(m);
              existingNames.add(m.model_name);
            }
          }
          console.log(`   Total candidates: ${candidates.length}`);
        }
      } catch {}
    }

    recorder.record("extract", "Extract coding model listing from search results");

    // ═══ Step 3: Visit each model page and check Safetensor section ═══
    console.log("\n🔍 Checking each model for Safetensor section and parameter count...");

    for (const cand of candidates) {
      if (collectedModels.length >= 5) break;

      const modelName = cand.model_name;
      const modelPath = cand.model_url || `/${modelName}`;
      const modelUrl = modelPath.startsWith("http") ? modelPath : `https://huggingface.co${modelPath}`;

      console.log(`\n📦 Visiting: ${modelName}`);
      try {
        await page.goto(modelUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(3_000);

        // Get the page text to check for Safetensors
        const bodyText = await page.evaluate(() => document.body?.innerText || "");

        // Check for Safetensors mention
        if (!/safetensor/i.test(bodyText)) {
          console.log(`   ❌ No Safetensor section found, skipping`);
          continue;
        }
        console.log(`   ✅ Found Safetensors reference`);

        // Extract parameter info using AI
        const paramSchema = z.object({
          has_safetensors: z.boolean().describe("Whether the model page mentions safetensors format"),
          parameter_count: z.string().nullable().describe("Number of parameters as shown on the page, e.g. '7B', '1.5B', '6.7B'. Return null if not found."),
          parameter_details: z.string().nullable().describe("Any additional parameter details from the Safetensor section"),
        });

        let paramInfo = null;
        try {
          paramInfo = await stagehand.extract(
            "Look at this model page and extract: " +
            "1) Whether it has Safetensors (look for a 'safetensors' badge or mention in the model card). " +
            "2) The parameter count — look in the Safetensors section, model card metadata, or tags for a number like '7B', '1.5B', '3B', etc. " +
            "3) Any additional details about parameters from the Safetensor section.",
            paramSchema,
          );
        } catch (e) {
          console.log(`   ⚠ Extract error: ${e.message}`);
        }

        if (paramInfo) {
          console.log(`   Safetensors: ${paramInfo.has_safetensors}`);
          console.log(`   Parameters: ${paramInfo.parameter_count || "unknown"}`);
          console.log(`   Details: ${paramInfo.parameter_details || "none"}`);

          if (paramInfo.has_safetensors && paramInfo.parameter_count) {
            // Parse parameter count to check if under 9B
            const paramStr = paramInfo.parameter_count;
            const match = paramStr.match(/([\d.]+)\s*[Bb]/);
            if (match) {
              const paramVal = parseFloat(match[1]);
              if (paramVal < 9) {
                collectedModels.push({
                  model_name: modelName,
                  parameters: paramStr,
                  details: paramInfo.parameter_details || "",
                });
                console.log(`   ✅ ADDED: ${modelName} — ${paramStr} (under 9B, has Safetensors)`);
              } else {
                console.log(`   ❌ ${paramVal}B >= 9B, skipping`);
              }
            } else {
              console.log(`   ⚠ Could not parse parameter count: ${paramStr}`);
            }
          } else if (!paramInfo.has_safetensors) {
            console.log(`   ❌ No Safetensors confirmed`);
          } else {
            console.log(`   ⚠ Parameter count not found`);
          }
        }

        recorder.record("act", `Check model: ${modelName}`);
      } catch (e) {
        console.log(`   ⚠ Error visiting ${modelName}: ${e.message}`);
      }

      await page.waitForTimeout(1_000);
    }

    // ═══ Print results ═══
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  Coding Models Under 9B Parameters (${collectedModels.length} found):`);
    console.log("═══════════════════════════════════════════════════════════");
    if (collectedModels.length > 0) {
      collectedModels.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.model_name} | ${m.parameters}`);
        if (m.details) console.log(`     Details: ${m.details}`);
      });
    } else {
      console.log("  No models found matching criteria");
    }

    // ═══ Save Python script ═══
    fs.writeFileSync(
      path.join(__dirname, "huggingface_search.py"),
      genPython(collectedModels),
      "utf-8",
    );
    console.log(`\n✅ Python script saved to huggingface_search.py`);

    // ═══ Save recorded actions ═══
    fs.writeFileSync(
      path.join(__dirname, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2),
      "utf-8",
    );
    console.log(`✅ Recorded actions saved`);

  } finally {
    await stagehand.close();
    fs.rmSync(tmpProfile, { recursive: true, force: true });
    clearTimeout(_timer);
    console.log("\n🎊 Done!");
  }
})();
