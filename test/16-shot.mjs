import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--lang=ko-KR'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto('http://localhost:4817/sevenpoker2026/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: process.argv[2] });
await browser.close();
