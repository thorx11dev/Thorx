import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME_PATH = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT_DIR = '/tmp/qa-shots';
fs.mkdirSync(OUT_DIR, { recursive: true });

// Reuse the account created by the first successful run (registration is
// rate-limited per device/IP, so we log in instead of registering again).
const email = 'qa.dashboard.1785720073827@example.com';
const password = 'ThorxQA123!';

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[browser console error]', msg.text());
  });
  page.on('pageerror', (err) => console.log('[page error]', err.message));

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/portal`, { waitUntil: 'networkidle0', timeout: 30000 });

  await page.waitForSelector('[data-testid="tab-login"]', { timeout: 15000 });
  await page.click('[data-testid="tab-login"]');
  await page.waitForSelector('[data-testid="input-login-email"]', { timeout: 15000 });
  await page.type('[data-testid="input-login-email"]', email, { delay: 10 });
  await page.type('[data-testid="input-login-password"]', password, { delay: 10 });

  await page.click('[data-testid="button-login-submit"]');

  await page.waitForFunction(
    () => location.pathname === '/user-portal',
    { timeout: 20000 }
  );
  // let charts/animations settle
  await new Promise((r) => setTimeout(r, 2500));

  await page.screenshot({ path: `${OUT_DIR}/desktop.png`, fullPage: true });
  console.log('Saved desktop screenshot');

  await page.setViewport({ width: 390, height: 844 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT_DIR}/mobile.png`, fullPage: true });
  console.log('Saved mobile screenshot');

  console.log('QA_EMAIL=' + email);
} finally {
  await browser.close();
}
