import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ko-KR'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto('http://localhost:4817/sevenpoker2026/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1200));
// 공개 카드 선택
await page.click('.pk-card.pickable');
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: '/downloads/sp-02-betting.png' });
// 위임 테스트: 위임 켜고 진행 관찰
const dlg = await page.$('.pk-delegate');
if (dlg) { await dlg.click(); }
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: '/downloads/sp-03-delegated.png' });
// 직접 하기로 복귀
const back = await page.$('.pk-btn-block');
if (back) { await back.click(); }
// 판 끝까지: 체크/콜 반복
for (let i = 0; i < 80; i++) {
  const next = await page.$('.pk-next');
  if (next) break;
  const btns = await page.$$('.pk-actions button');
  let clicked = false;
  for (const b of btns) {
    const t = await b.evaluate(e => e.textContent);
    if (t.startsWith('체크') || t.startsWith('콜')) { await b.click(); clicked = true; break; }
  }
  await new Promise(r => setTimeout(r, clicked ? 500 : 400));
}
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: '/downloads/sp-04-result.png' });
const chips = await page.evaluate(() => localStorage.getItem('sevenpoker2026.chips'));
console.log('saved chips:', chips);
await browser.close();
