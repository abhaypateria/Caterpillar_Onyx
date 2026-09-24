import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
p.on('console', (m) => { if (['error', 'warn'].includes(m.type())) console.log('console', m.type(), m.text().slice(0, 160)); });
p.on('requestfailed', (r) => console.log('failed', r.url().slice(0, 100), r.failure()?.errorText));
p.on('response', (r) => { if (/googleapis|tfhub|kaggle/.test(r.url())) console.log('model', r.status(), r.url().slice(0, 90)); });
await p.goto('http://localhost:5173/#/login', { waitUntil: 'networkidle0' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' });
for (const x of await p.$$('button')) if ((await x.evaluate((e) => e.textContent)).includes('Ravi')) { await x.click(); break; }
await new Promise((r) => setTimeout(r, 600));
await p.goto('http://localhost:5173/#/safety', { waitUntil: 'networkidle0' });
for (const x of await p.$$('button')) if ((await x.evaluate((e) => e.textContent)).includes('Camera detection')) { await x.click(); break; }
const state = () => p.evaluate(() => { const v = document.querySelector('.camwrap video'); const btn = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('📷'))?.textContent; return { btn, t: v ? +v.currentTime.toFixed(2) : null, live: v?.srcObject?.getVideoTracks()[0]?.readyState ?? null }; });
for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 5000)); console.log(`${(i + 1) * 5}s`, JSON.stringify(await state())); }
await b.close();
