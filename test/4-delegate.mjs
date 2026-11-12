import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ko-KR'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const handNum = () => page.evaluate(() => (document.querySelector('.pk-title')?.textContent.match(/(\d+)번째 판/) || [0, 0])[1] | 0);
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

// 시나리오 A: 첫 공개 선택 전부터 위임 → 내 공개 패도 자동 선택되어야 함
await page.goto('http://localhost:4817/sevenpoker2026/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1200));
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 800));
const dlg0 = await page.$('.pk-delegate');
if (!dlg0) { console.log('FAIL: 시작 화면에 위임 버튼 없음'); process.exit(1); }
await dlg0.click();
log('위임 시작 (공개 선택 전)');
await new Promise(r => setTimeout(r, 6000));
const picked = await page.evaluate(() => !document.querySelector('.pk-hint') || document.querySelector('.pk-hint').textContent.includes('상대'));
log(picked ? 'OK: 위임 중 내 공개 패 자동 선택됨' : 'FAIL: 내 공개 패가 자동 선택되지 않음');

// 시나리오 B: 계속 위임 → 사람 클릭 없이 여러 판 자동 진행
let maxHand = await handNum();
const t0 = Date.now();
while (Date.now() - t0 < 90000 && maxHand < 4) {
  await new Promise(r => setTimeout(r, 2000));
  const h = await handNum();
  if (h > maxHand) { maxHand = h; log(`자동 진행: ${h}번째 판`); }
}
log(maxHand >= 4 ? `OK: 클릭 없이 ${maxHand}번째 판까지 자동 진행` : `FAIL: 자동 진행이 ${maxHand}번째 판에서 멈춤`);
await page.screenshot({ path: '/downloads/sp-05-autohands.png' });

// 시나리오 C: 직접 하기 복귀 → 진행이 내 행동을 기다려야 함 (중복 행동 없음)
for (let i = 0; i < 30; i++) {
  const back = await page.$('.pk-btn-block');
  if (back) { await back.click(); break; }
  await new Promise(r => setTimeout(r, 500));
}
log('직접 하기 클릭');
await new Promise(r => setTimeout(r, 1000));
const hBefore = await handNum();
await new Promise(r => setTimeout(r, 8000));
const hAfter = await handNum();
const waiting = await page.evaluate(() => !!(document.querySelector('.pk-actions') || document.querySelector('.pk-card.pickable') || document.querySelector('.pk-next')));
log(hBefore === hAfter && waiting ? `OK: 복귀 후 자동 진행 멈춤, 내 행동 대기 중 (${hAfter}번째 판)` : `FAIL: 복귀 후에도 자동 진행 (h ${hBefore}→${hAfter}) 또는 대기 UI 없음`);
await page.screenshot({ path: '/downloads/sp-06-reclaim.png' });

// 시나리오 D: 복귀 후 한 번 행동 → 중복 적용 없이 한 번만 반영
const chipsBefore = await page.evaluate(() => document.querySelector('.pk-me-side span')?.textContent);
const act = await page.$('.pk-call, .pk-fold, .pk-card.pickable, .pk-next');
if (act) { await act.click(); await new Promise(r => setTimeout(r, 700)); }
const chipsAfter = await page.evaluate(() => document.querySelector('.pk-me-side span')?.textContent);
log(`행동 1회 반영: 칩 ${chipsBefore} → ${chipsAfter}`);
await browser.close();
