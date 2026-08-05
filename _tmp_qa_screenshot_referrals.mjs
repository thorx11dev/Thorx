import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://localhost:5000';
const EXEC = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

const run = async () => {
  fs.mkdirSync('screenshots_tmp', { recursive: true });

  const browser = await chromium.launch({ executablePath: EXEC, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[browser-error]', msg.text());
  });
  page.on('pageerror', (err) => console.log('[page-error]', err.message));

  const stamp = Date.now();
  const email = `qa.referrals.${stamp}@example.com`;
  const password = 'QaTest123';

  await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });

  await page.fill('[data-testid="input-register-name"]', 'QA Referrals Tester');
  await page.fill('[data-testid="input-register-email"]', email);
  await page.fill('[data-testid="input-register-password"]', password);
  await page.fill('[data-testid="input-register-confirm-password"]', password);
  await page.click('[data-testid="button-register-submit"]');

  await page.waitForURL(/portal/, { timeout: 20000 });
  await page.waitForTimeout(1500);

  // Navigate Dashboard(0) -> Work(1) -> Referrals(2) via desktop arrow control
  await page.click('[data-testid="button-next-section"]');
  await page.waitForTimeout(500);
  await page.click('[data-testid="button-next-section"]');
  await page.waitForSelector('[data-testid="section-referrals"]', { timeout: 10000 });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'screenshots_tmp/referrals_desktop.png', fullPage: true });

  await page.setViewportSize({ width: 768, height: 1100 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots_tmp/referrals_tablet.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots_tmp/referrals_mobile.png', fullPage: true });

  await browser.close();

  fs.writeFileSync('screenshots_tmp/qa_account.json', JSON.stringify({ email, password }));
  console.log('DONE', email);
};

run().catch((e) => {
  console.error('SCRIPT_FAILED', e);
  process.exit(1);
});
