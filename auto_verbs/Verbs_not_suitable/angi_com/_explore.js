const { Stagehand } = require('@browserbasehq/stagehand');
const { setupLLMClient } = require('../../stagehand-utils');

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: 'LOCAL', verbose: 0, llmClient,
    localBrowserLaunchOptions: { headless: false, args: ['--disable-blink-features=AutomationControlled','--start-maximized'] }
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  
  // Go to Angi homepage
  await page.goto('https://www.angi.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());

  // Search for plumber using stagehand.act
  console.log('\n--- Searching for plumber ---');
  await stagehand.act('Clear the search input field and type "plumber"');
  await page.waitForTimeout(2000);

  // Check for suggestions
  const suggestionsText = await page.evaluate(() => {
    const hits = document.querySelector('[data-testid="hits-wrapper-test"]');
    return hits ? hits.innerText : 'no hits-wrapper found';
  });
  console.log('Suggestions:', suggestionsText.substring(0, 500));

  // Try to click 'Plumber' or 'Plumbing' in suggestions
  try {
    await stagehand.act('click the Plumbing option in the search suggestions dropdown');
    await page.waitForTimeout(5000);
    console.log('\nAfter clicking suggestion URL:', page.url());
    
    const resultText = await page.evaluate(() => document.body.innerText);
    const resLines = resultText.split('\n').filter(l => l.trim()).slice(0, 100);
    console.log('\nResult page (first 100 lines):');
    resLines.forEach((l, i) => console.log(i + ': ' + l.substring(0, 150)));
    
    // Check data-testid on result page
    const testIds = await page.evaluate(() => {
      const els = document.querySelectorAll('[data-testid]');
      return [...new Set(Array.from(els).map(e => e.getAttribute('data-testid')))];
    });
    console.log('\ndata-testid values on result page:', JSON.stringify(testIds));
  } catch (e) {
    console.log('Error clicking suggestion:', e.message);
  }

  await stagehand.close();
  process.exit(0);
})();
