// 로컬 렌더 검증: http.server로 서빙된 docs/를 실제 Chrome으로 390/320 폭 캡처.
// 사용: node test/local-shot.mjs <baseURL> <outPrefix>
import puppeteer from 'puppeteer-core';

const base = process.argv[2] ?? 'http://127.0.0.1:8123';
const prefix = process.argv[3] ?? '/tmp/local';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2'],
});

async function shot(width, height, name, actions) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.goto(`${base}/`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 400));
  if (actions) await actions(page);
  await page.screenshot({ path: `${prefix}-${name}.png` });
  console.log(`shot ${name}: ${prefix}-${name}.png`);
  return page;
}

// 스토리 1장 진입 공통 액션
async function enterStory(page) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.pk-menu button')].find((x) => x.textContent.includes('스토리'));
    b.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.pk-scene button')].find((x) => x.textContent.includes('대국 시작'));
    b.click();
  });
  await new Promise((r) => setTimeout(r, 600));
}

// 1) 390 메뉴
await shot(390, 844, 'menu-390');
// 2) 390 스토리 대국 — 제목 줄(목표 표시) + 아바타 폴백
const p1 = await shot(390, 844, 'story-390', enterStory);
const title390 = await p1.evaluate(() => document.querySelector('.pk-title')?.textContent ?? 'NO TITLE');
const ava390 = await p1.evaluate(() => ({
  fallbacks: [...document.querySelectorAll('.pk-ava-fallback')].map((e) => e.textContent),
  images: [...document.querySelectorAll('.pk-ava')].map((i) => i.complete && i.naturalWidth > 0),
  exitBox: (() => { const b = document.querySelector('.pk-exit'); return b ? { w: b.offsetWidth, h: b.offsetHeight, text: b.textContent } : null; })(),
}));
console.log('390 title:', title390);
console.log('390 avatars:', JSON.stringify(ava390));
await p1.close();

// 3) 320 스토리 대국
const p2 = await shot(320, 568, 'story-320', enterStory);
const title320 = await p2.evaluate(() => document.querySelector('.pk-title')?.textContent ?? 'NO TITLE');
const exit320 = await p2.evaluate(() => { const b = document.querySelector('.pk-exit'); return b ? { w: b.offsetWidth, h: b.offsetHeight } : null; });
console.log('320 title:', title320);
console.log('320 exit button:', JSON.stringify(exit320));
await p2.close();

// 4) 390 메뉴(회귀)
await shot(320, 568, 'menu-320');

await browser.close();
