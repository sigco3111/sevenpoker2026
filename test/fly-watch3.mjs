// 비행 도착지 검증: 각 .pk-fly의 생존 시간 + 비행 종점이 어느 자리인지 기록(통제 환경)
import puppeteer from 'puppeteer-core';
const base = 'http://127.0.0.1:8126';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto(base + '/', { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => { const b=[...document.querySelectorAll('.pk-menu button')].find(x=>x.textContent.includes('토너먼트')); b.click(); });
await new Promise(r=>setTimeout(r,300));
await page.evaluate(() => { const b=[...document.querySelectorAll('.pk-scene button')].find(x=>x.textContent.includes('대국 시작')); b.click(); });
await new Promise(r=>setTimeout(r,800));
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='위임'); if (b) b.click(); });
await page.evaluate(() => {
  window.__fly = [];
  const births = new Map();
  const seatOf = (r) => {
    const me = document.querySelector('.pk-me-cards')?.getBoundingClientRect();
    if (me && r.left >= me.left - 40 && r.left <= me.right + 40 && r.top >= me.top - 80) return 'me';
    const opps = [...document.querySelectorAll('.pk-opp')];
    for (let i = 0; i < opps.length; i++) { const o = opps[i].getBoundingClientRect(); if (r.left >= o.left - 40 && r.left <= o.right + 40 && r.top >= o.top - 40 && r.top <= o.bottom + 40) return 'opp' + (i + 1); }
    return 'other';
  };
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) if (n.nodeType===1 && n.classList?.contains('pk-fly')) {
        births.set(n, performance.now());
        setTimeout(() => { if (n.isConnected) n.__dest = seatOf(n.getBoundingClientRect()); }, 540);
      }
      for (const n of m.removedNodes) if (n.nodeType===1 && n.classList?.contains('pk-fly') && births.has(n)) {
        window.__fly.push({ life: Math.round(performance.now() - births.get(n)), dest: n.__dest ?? 'gone-before-540ms' });
        births.delete(n);
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
await new Promise(r=>setTimeout(r,30000));
console.log(JSON.stringify(await page.evaluate(() => window.__fly)));
await browser.close();
