const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Domino's Pizza – Menu Extraction
 *
 * Navigates to the Domino's specialty pizza menu page to extract pizza names
 * and descriptions, then uses the Domino's public API to get size options
 * and starting prices for a nearby store.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.dominos.com/menu/specialty",
  storeLocatorApi: "https://order.dominos.com/power/store-locator",
  menuApiBase: "https://order.dominos.com/power/store",
  location: "New York, NY 10001",
  maxResults: 5,
  waits: { page: 8000, action: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Domino's Pizza - Menu Extraction");
  lines.push("Location: " + cfg.location);
  lines.push("");
  lines.push("Generated on: " + ts);
  lines.push("Recorded " + n + " browser interactions");
  lines.push("");
  lines.push("Navigates to the Domino's specialty pizza menu page to extract pizza names");
  lines.push("and descriptions, then uses the Domino's public API for prices and sizes.");
  lines.push('"""');
  lines.push("");
  lines.push("import re");
  lines.push("import json");
  lines.push("import os, sys, shutil");
  lines.push("from urllib.request import urlopen, Request");
  lines.push("from urllib.parse import quote");
  lines.push("from playwright.sync_api import Playwright, sync_playwright");
  lines.push("");
  lines.push('sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))');
  lines.push("from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws");
  lines.push("");
  lines.push("");
  lines.push("STORE_LOCATOR_API = \"" + cfg.storeLocatorApi + "\"");
  lines.push("MENU_API_BASE = \"" + cfg.menuApiBase + "\"");
  lines.push("MENU_URL = \"" + cfg.url + "\"");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    location: str = "' + cfg.location + '",');
  lines.push("    max_results: int = " + cfg.maxResults + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  Location: {location}")');
  lines.push('    print(f"  Max results: {max_results}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("dominos_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        # ── Navigate to specialty pizzas page ─────────────────────────');
  lines.push('        print("Loading Domino\'s specialty pizza menu...")');
  lines.push("        page.goto(MENU_URL)");
  lines.push('        page.wait_for_load_state("domcontentloaded")');
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        # ── Extract pizza names and descriptions from page ────────────");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        pizza_names = []");
  lines.push("        in_section = False");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines):");
  lines.push("            line = text_lines[i]");
  lines.push('            if line == "SPECIALTY PIZZAS" and not in_section:');
  lines.push('                if i + 1 < len(text_lines) and text_lines[i + 1] in ("START YOUR ORDER", "DELIVERY"):');
  lines.push("                    in_section = True");
  lines.push("                    i += 1");
  lines.push("                    continue");
  lines.push("            if in_section:");
  lines.push('                if line in ("FULL MENU", "BUILD YOUR OWN"):');
  lines.push("                    break");
  lines.push('                if line not in ("START YOUR ORDER", "DELIVERY", "OR", "CARRYOUT",');
  lines.push('                                "NEW!", "TRENDING") and not line.startswith("Customize "):');
  lines.push('                    if len(line) < 40 and "." not in line and "," not in line:');
  lines.push('                        desc = ""');
  lines.push("                        if i + 1 < len(text_lines):");
  lines.push("                            next_line = text_lines[i + 1]");
  lines.push('                            if len(next_line) > 40 or "," in next_line:');
  lines.push("                                desc = next_line");
  lines.push('                        pizza_names.append({"name": line, "description": desc})');
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print(f"\\nFound {len(pizza_names)} specialty pizzas on page")');
  lines.push("");
  lines.push("        # ── Get prices from Domino's API ──────────────────────────────");
  lines.push('        print("\\nFetching store and price data from Domino\'s API...")');
  lines.push("");
  lines.push('        store_url = f"{STORE_LOCATOR_API}?s={quote(location)}&type=Carryout"');
  lines.push('        req = Request(store_url, headers={"User-Agent": "Mozilla/5.0"})');
  lines.push("        store_data = json.loads(urlopen(req, timeout=10).read().decode())");
  lines.push('        stores = store_data.get("Stores", [])');
  lines.push("        if not stores:");
  lines.push('            print("  No stores found for location:", location)');
  lines.push("            return results");
  lines.push("");
  lines.push('        store_id = stores[0]["StoreID"]');
  lines.push('        store_addr = stores[0].get("AddressDescription", "").split("\\n")[0]');
  lines.push('        print(f"  Using store: #{store_id} ({store_addr})")');
  lines.push("");
  lines.push('        menu_url = f"{MENU_API_BASE}/{store_id}/menu?lang=en&structured=true"');
  lines.push('        req = Request(menu_url, headers={"User-Agent": "Mozilla/5.0"})');
  lines.push("        menu_data = json.loads(urlopen(req, timeout=15).read().decode())");
  lines.push('        products = menu_data.get("Products", {})');
  lines.push('        variants = menu_data.get("Variants", {})');
  lines.push("");
  lines.push("        api_pizzas = {}");
  lines.push("        for code, prod in products.items():");
  lines.push('            if prod.get("ProductType") == "Pizza" and code != "S_PIZZA":');
  lines.push('                api_pizzas[prod["Name"]] = {"code": code, "product": prod}');
  lines.push("");
  lines.push("        for pizza in pizza_names[:max_results]:");
  lines.push('            name = pizza["name"]');
  lines.push('            desc = pizza["description"]');
  lines.push("");
  lines.push("            api_match = api_pizzas.get(name)");
  lines.push("            sizes = []");
  lines.push('            starting_price = "N/A"');
  lines.push("");
  lines.push("            if api_match:");
  lines.push('                prod = api_match["product"]');
  lines.push('                variant_codes = prod.get("Variants", [])');
  lines.push("                size_prices = {}");
  lines.push("                for vc in variant_codes:");
  lines.push("                    v = variants.get(vc)");
  lines.push("                    if v:");
  lines.push('                        size_code = v.get("SizeCode", "")');
  lines.push('                        price = float(v.get("Price", "0"))');
  lines.push('                        if size_code == "10":');
  lines.push("                            label = 'Small (10\")'");
  lines.push('                        elif size_code == "12":');
  lines.push("                            label = 'Medium (12\")'");
  lines.push('                        elif size_code == "14":');
  lines.push("                            label = 'Large (14\")'");
  lines.push('                        elif size_code == "16":');
  lines.push("                            label = 'X-Large (16\")'");
  lines.push("                        else:");
  lines.push("                            label = size_code");
  lines.push("                        if label not in size_prices or price < size_prices[label]:");
  lines.push("                            size_prices[label] = price");
  lines.push("");
  lines.push("                sizes = sorted(size_prices.items(), key=lambda x: x[1])");
  lines.push("                if sizes:");
  lines.push('                    starting_price = "$" + f"{sizes[0][1]:.2f}"');
  lines.push("");
  lines.push("            results.append({");
  lines.push('                "name": name,');
  lines.push('                "description": desc[:80] + "..." if len(desc) > 80 else desc,');
  lines.push('                "sizes": ["$" + f"{s[1]:.2f}" + " " + s[0] for s in sizes],');
  lines.push('                "starting_price": starting_price,');
  lines.push("            })");
  lines.push("");
  lines.push("        # ── Print results ─────────────────────────────────────────────");
  lines.push("        print()");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"Domino\'s Specialty Pizzas (Store #{store_id})")');
  lines.push('        print("=" * 60)');
  lines.push("        for i, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{i}. {r['name']}\")");
  lines.push("            if r['description']:");
  lines.push("                print(f\"   {r['description']}\")");
  lines.push("            print(f\"   Starting price: {r['starting_price']}\")");
  lines.push("            if r['sizes']:");
  lines.push("                print(f\"   Sizes: {', '.join(r['sizes'])}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} pizzas")');
  lines.push("");
  lines.push("    except Exception as e:");
  lines.push('        print(f"Error: {e}")');
  lines.push("        import traceback");
  lines.push("        traceback.print_exc()");
  lines.push("    finally:");
  lines.push("        browser.close()");
  lines.push("        chrome_proc.terminate()");
  lines.push("        shutil.rmtree(profile_dir, ignore_errors=True)");
  lines.push("");
  lines.push("    return results");
  lines.push("");
  lines.push("");
  lines.push('if __name__ == "__main__":');
  lines.push("    with sync_playwright() as pw:");
  lines.push("        run(pw)");
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    llmClient,
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    // Navigate to specialty pizza page
    console.log("Loading Domino's specialty pizza menu...");
    recorder.record("page.goto", { url: CFG.url });
    await page.goto(CFG.url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    // Dismiss cookie banner if present
    try {
      await stagehand.act("click ALLOW ALL button");
      recorder.record("click", { selector: 'button:has-text("ALLOW ALL")' });
      await new Promise(r => setTimeout(r, CFG.waits.action));
    } catch(e) {}

    // Extract pizza names from page
    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    // Find pizza names - they appear between the header and footer
    const pizzaNames = [];
    let inSection = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === "SPECIALTY PIZZAS" && !inSection) {
        if (i + 1 < lines.length && (lines[i + 1] === "START YOUR ORDER" || lines[i + 1] === "DELIVERY")) {
          inSection = true;
          continue;
        }
      }
      if (inSection) {
        if (line === "FULL MENU" || line === "BUILD YOUR OWN") break;
        if (!["START YOUR ORDER", "DELIVERY", "OR", "CARRYOUT", "NEW!", "TRENDING"].includes(line)
            && !line.startsWith("Customize ")) {
          if (line.length < 40 && !line.includes(".") && !line.includes(",")) {
            const desc = (i + 1 < lines.length && (lines[i + 1].length > 40 || lines[i + 1].includes(",")))
              ? lines[i + 1] : "";
            pizzaNames.push({ name: line, description: desc });
          }
        }
      }
    }
    console.log("Found " + pizzaNames.length + " specialty pizzas on page");

    // Get prices from Domino's API
    console.log("\nFetching store and prices from Domino's API...");
    const storeResp = await fetch(CFG.storeLocatorApi + "?s=" + encodeURIComponent(CFG.location) + "&type=Carryout");
    const storeData = await storeResp.json();
    const stores = storeData.Stores || [];
    if (stores.length === 0) {
      console.log("No stores found!");
    } else {
      const storeId = stores[0].StoreID;
      const storeAddr = (stores[0].AddressDescription || "").split("\n")[0];
      console.log("Using store: #" + storeId + " (" + storeAddr + ")");

      const menuResp = await fetch(CFG.menuApiBase + "/" + storeId + "/menu?lang=en&structured=true");
      const menuData = await menuResp.json();
      const products = menuData.Products || {};
      const variants = menuData.Variants || {};

      // Build API pizza lookup
      const apiPizzas = {};
      for (const [code, prod] of Object.entries(products)) {
        if (prod.ProductType === "Pizza" && code !== "S_PIZZA") {
          apiPizzas[prod.Name] = { code, product: prod };
        }
      }

      const results = [];
      for (const pizza of pizzaNames.slice(0, CFG.maxResults)) {
        const apiMatch = apiPizzas[pizza.name];
        let sizes = [];
        let startingPrice = "N/A";

        if (apiMatch) {
          const variantCodes = apiMatch.product.Variants || [];
          const sizePrices = {};
          for (const vc of variantCodes) {
            const v = variants[vc];
            if (v) {
              const sizeCode = v.SizeCode || "";
              const price = parseFloat(v.Price || "0");
              let label;
              if (sizeCode === "10") label = 'Small (10")';
              else if (sizeCode === "12") label = 'Medium (12")';
              else if (sizeCode === "14") label = 'Large (14")';
              else if (sizeCode === "16") label = 'X-Large (16")';
              else label = sizeCode;
              if (!(label in sizePrices) || price < sizePrices[label]) {
                sizePrices[label] = price;
              }
            }
          }
          sizes = Object.entries(sizePrices).sort((a, b) => a[1] - b[1]);
          if (sizes.length > 0) startingPrice = "$" + sizes[0][1].toFixed(2);
        }

        results.push({
          name: pizza.name,
          description: pizza.description.length > 80 ? pizza.description.substring(0, 80) + "..." : pizza.description,
          sizes: sizes.map(s => s[0] + " ($" + s[1].toFixed(2) + ")"),
          startingPrice,
        });
      }

      // Print results
      console.log("\n" + "=".repeat(60));
      console.log("Domino's Specialty Pizzas (Store #" + storeId + ")");
      console.log("=".repeat(60));
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        console.log("\n" + (i + 1) + ". " + r.name);
        if (r.description) console.log("   " + r.description);
        console.log("   Starting price: " + r.startingPrice);
        if (r.sizes.length > 0) console.log("   Sizes: " + r.sizes.join(", "));
      }
      console.log("\nFound " + results.length + " pizzas");
    }

    // Generate Python file
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "dominos_menu.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("\nPython script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
