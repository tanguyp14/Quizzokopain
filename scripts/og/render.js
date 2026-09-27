// Renders scripts/og/og-image.html into public/og/neutron.png (1200 × 630, link previews).
const path = require('node:path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(`file://${path.join(__dirname, 'og-image.html')}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, '..', '..', 'public', 'og', 'neutron.png') });
  await browser.close();
})();
