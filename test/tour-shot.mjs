import puppeteer from 'puppeteer-core';
const base = 'http://127.0.0.1:8124';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage','--force-device-scale-factor=2'] });
async function enterTour(page) {
  await page.evaluate(() => { const b=[...document.querySelectorAll('.pk-menu button')].find(x=>x.textContent.includes('토너먼트')); b.click(); });
  await new Promise(r=>setTimeout(r,300));
  await page.evaluate(() => { const b=[...document.querySelectorAll('.pk-scene button')].find(x=>x.textContent.includes('대국 시작')); b.click(); });
  await new Promise(r=>setTimeout(r,700));
}
for (const [w,h,name] of [[390,844,'390'],[320,568,'320']]) {
  const page = await browser.newPage();
  await page.setViewport({ width:w, height:h, deviceScaleFactor:2 });
  await page.goto(base+'/', { waitUntil:'networkidle0', timeout:30000 });
  await new Promise(r=>setTimeout(r,400));
  await enterTour(page);
  const info = await page.evaluate(() => {
    const t = document.querySelector('.pk-title');
    const small = t?.querySelector('small');
    const exit = document.querySelector('.pk-exit');
    const r = small?.getBoundingClientRect(); const tr = t?.getBoundingClientRect(); const er = exit?.getBoundingClientRect();
    return { title: t?.textContent, smallLines: r && tr ? Math.round(r.height/parseFloat(getComputedStyle(small).lineHeight||'14')) : 0, exitVisible: er ? er.width>0 && er.x+er.width<= (tr?.right??0)+1 : false, scroll: document.documentElement.scrollWidth };
  });
  await page.screenshot({ path: `/downloads/tour-progress-${name}.png` });
  console.log(name, JSON.stringify(info));
  await page.close();
}
await browser.close();
