// Onyx end-to-end suite (headless Chrome + simulated microphone).
// Usage (web on :5173, API on :8000):  cd e2e && npm install && python make_audio.py && node run.mjs [core,i18n,mobile,offline,voice]
// Run one case: IDS=SAF-06 node run.mjs core
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

import { fileURLToPath } from 'node:url';
const DIR = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, ''), ONLY = process.argv[2];
const APP = 'http://localhost:5173/#';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch({ audio, width = 1280 } = {}) {
  const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
  if (audio) args.push(`--use-file-for-fake-audio-capture=${DIR}/audio/${audio}.wav%noloop`);
  const browser = await puppeteer.launch({ executablePath: CHROME, args });
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.api = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) page.api.push(u.pathname.slice(4)); });
  return { browser, page };
}
const bodyText = (p) => p.evaluate(() => document.body.innerText);
async function click(p, text, sel = 'button, a') {
  const els = await p.$$(sel);
  for (const e of els) if ((await e.evaluate((x) => x.textContent)).includes(text)) { await e.click(); return true; }
  throw new Error(`no ${sel} with "${text}"`);
}
async function waitFor(p, fn, ms = 10000, step = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
}
async function login(p, lang = 'English', op = 'Ravi') {
  await p.goto(`${APP}/login`, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle0' });
  await click(p, lang); await click(p, op);
  await sleep(600);
}
const go = async (p, route) => { await p.goto(`${APP}/${route}`, { waitUntil: 'networkidle0' }); await sleep(500); };
async function test(id, name, fn) {
  if (process.env.IDS && !process.env.IDS.split(',').includes(id)) return;
  const t0 = Date.now();
  try { const note = await fn(); results.push({ id, name, ok: true, note: note ?? '', s: ((Date.now() - t0) / 1000).toFixed(1) }); }
  catch (e) { results.push({ id, name, ok: false, note: String(e.message).slice(0, 160), s: ((Date.now() - t0) / 1000).toFixed(1) }); }
  const r = results.at(-1);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${id} ${name}${r.note ? ' — ' + r.note : ''}`);
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const banner = (p) => p.$eval('.alertbar', (e) => e.textContent).catch(() => '');
const want = (g) => !ONLY || ONLY.split(',').includes(g);

// ------------------------------------------------------------------ LOGIN + NAV
if (want('core')) {
  const { browser, page: p } = await launch();
  await test('LOG-01', 'Login screen shows 4 languages and 3 operators', async () => {
    await p.goto(`${APP}/login`, { waitUntil: 'networkidle0' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' });
    const t = await bodyText(p);
    for (const s of ['English', 'हिन्दी', 'தமிழ்', 'ಕನ್ನಡ', 'Ravi', 'Murugan', 'Manjunath']) assert(t.includes(s), `missing ${s}`);
  });
  await test('LOG-02', 'Protected routes redirect to login when logged out', async () => {
    await p.goto(`${APP}/replay`, { waitUntil: 'networkidle0' }); await sleep(300);
    assert(p.url().includes('/login'), `url ${p.url()}`);
  });
  await test('LOG-03', 'Login as Ravi in Hindi opens Today in Hindi', async () => {
    await login(p, 'हिन्दी');
    assert(p.url().includes('/dashboard'), p.url());
    const t = await bodyText(p); assert(t.includes('अभी का काम'), 'Hindi label missing');
  });
  await test('LOG-04', 'Language switch in header changes UI to English', async () => {
    await p.select('header select', 'en'); await sleep(300);
    assert(/current task/i.test(await bodyText(p)), 'still not English');
  });
  await test('LOG-05', 'Machine choice changes the task plan (loader tasks)', async () => {
    await p.goto(`${APP}/login`, { waitUntil: 'networkidle0' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' });
    await p.select('select', 'LDR001'); await click(p, 'Ravi'); await sleep(600);
    const h1 = await p.$eval('h1', (e) => e.textContent); const list = await p.$eval('.tasklist li', (ls) => Array.from(ls, (l) => l.innerText).join('|'));
    assert(/Material Loading/i.test(h1) && !/Demolition|Trenching/.test(list), `h1=${h1} list=${list.slice(0, 80)}`);
  });
  await test('LOG-06', 'Logout returns to login', async () => {
    await click(p, '⏻'); await sleep(300); assert(p.url().includes('/login'), p.url());
  });

  // ------------------------------------------------------------------ TODAY
  await login(p);
  let eta0 = '';
  await test('TOD-01', 'Four tasks scheduled; first is current with ETA, range and reasons', async () => {
    const t = await bodyText(p);
    assert(/EARTH EXCAVATION/i.test(t), 'no current task'); assert(/Range:/.test(t), 'no range');
    assert(/Beginner operator\s*\+\d+ min/.test(t), 'no reason line');
    assert((await p.$$('.tasklist li')).length === 4, 'not 4 tasks');
    eta0 = await p.$eval('.bignum', (e) => e.textContent);
    return `ETA ${eta0}`;
  });
  await test('TOD-02', 'Start → button becomes In progress; +1 cycle ×10 updates cycles and live pace', async () => {
    await click(p, 'Start'); await sleep(200);
    for (let i = 0; i < 10; i++) { await click(p, '+1 cycle'); await sleep(60); }
    const t = await bodyText(p);
    assert(/10\/30 cycles/.test(t), 'cycle count wrong'); assert(/Live pace so far/.test(t), 'no live pace'); assert(/In progress/.test(t), 'status');
    return `ETA ${await p.$eval('.bignum', (e) => e.textContent)}`;
  });
  await test('TOD-03', 'Done → next task (Trenching) becomes current', async () => {
    await click(p, 'Done'); await sleep(300);
    assert(/TRENCHING/i.test(await p.$eval('h1', (e) => e.textContent)), 'not advanced');
  });
  await test('TOD-04', 'State survives page reload (offline persistence)', async () => {
    await p.reload({ waitUntil: 'networkidle0' }); await sleep(400);
    assert(/TRENCHING/i.test(await p.$eval('h1', (e) => e.textContent)), 'lost after reload');
  });
  await test('TOD-05', 'Planner vs Onyx table: Onyx closer on T003 (42 vs 42)', async () => {
    const row = await p.$$eval('table.data tr', (rs) => rs.map((r) => r.innerText).find((x) => x.includes('T003')));
    assert(/42\s*✓\s*42/.test(row.replace(/\t/g, ' ')), row);
  });

  // ------------------------------------------------------------------ SAFETY
  await go(p, 'safety');
  await test('SAF-01', 'Engine on + belt off → critical seatbelt banner within 2 s', async () => {
    const t = await bodyText(p); if (/Engine: Off/.test(t)) await click(p, 'Engine');
    await click(p, 'Seatbelt');
    assert(await waitFor(p, async () => /Fasten your seatbelt/.test(await banner(p)), 2500), `banner: ${await banner(p)}`);
  });
  await test('SAF-02', 'After 60 s unbelted → supervisor alert + auto incident logged', async () => {
    const ok = await waitFor(p, async () => /Supervisor notified/.test(await banner(p)), 70000, 1000);
    assert(ok, `banner: ${await banner(p)}`);
    await sleep(500);
    assert(/Seatbelt unfastened for \d+ s/.test(await bodyText(p)), 'no auto incident');
  });
  await test('SAF-03', 'Fastening the belt clears the seatbelt banner', async () => {
    await click(p, 'Seatbelt'); await sleep(1500);
    assert(!/seatbelt/i.test(await banner(p)), `banner: ${await banner(p)}`);
  });
  await test('SAF-04', 'Manual incident form logs an incident', async () => {
    const n0 = (await p.$$('.tasklist li')).length;
    await p.type('textarea', 'Bucket touched the fence during swing'); await click(p, 'Log incident'); await sleep(300);
    assert((await p.$$('.tasklist li')).length === n0 + 1 || n0 === 1, 'count unchanged');
    assert((await bodyText(p)).includes('Bucket touched the fence'), 'text missing');
  });
  await test('SAF-05', 'Worse conditions (Rainy + Night + dust) widen proximity distances', async () => {
    const before = (await bodyText(p)).match(/Warn at ([\d.]+) m/)[1];
    const sels = await p.$$('.field select');
    await sels[0].select('Rainy'); await sels[2].select('Night'); await sels[3].select('y'); await sleep(300);
    const after = (await bodyText(p)).match(/Warn at ([\d.]+) m/)[1];
    assert(+after > +before, `${before} → ${after}`); return `${before} m → ${after} m`;
  });
  await test('SAF-06', 'Simulated worker approach → STOP banner + auto proximity incident', async () => {
    await click(p, 'Simulate worker');
    const ok = await waitFor(p, async () => /STOP/.test(await banner(p)), 20000, 300);
    assert(ok, `banner: ${await banner(p)}`); await sleep(500);
    assert(/Person\/object [\d.]+ m/.test(await bodyText(p)), 'no auto proximity incident');
  });
  await test('SAF-07', 'Heat: +30 min in extreme heat → break due; Took a break resets', async () => {
    const sels = await p.$$('.field select'); await sels[0].select('Sunny'); await sels[2].select('Day'); await sels[3].select('n');
    await click(p, '+30'); await sleep(1200);
    assert(/Take a break now/.test(await bodyText(p)), 'break not due');
    await click(p, 'Took a break'); await sleep(1200);
    assert(/Break in \d+ min/.test(await bodyText(p)), 'did not reset');
  });
  await test('SAF-08', 'Live weather button fills conditions from Open-Meteo', async () => {
    await click(p, 'Live weather');
    const note = await waitFor(p, async () => { const t = await bodyText(p); return /Live from Open-Meteo|Offline: using manual/.exec(t)?.[0]; }, 12000);
    assert(note, 'no weather note'); return note;
  });
  await test('SAF-09', 'Engine off clears proximity and seatbelt alerts', async () => {
    await click(p, 'Engine'); await sleep(1500);
    assert(!/STOP|Fasten/.test(await banner(p)), `banner: ${await banner(p)}`);
  });

  // ------------------------------------------------------------------ REPLAY
  await go(p, 'replay');
  await test('REP-01', 'Jump to 08:50 → warning at 09:10, belt off 09:30, reveal shown', async () => {
    await click(p, '08:50'); await p.select('select[aria-label="speed"]', '8');
    const ok = await waitFor(p, async () => /ONYX WARNED AT 09:10\. THE SEATBELT CAME OFF AT 09:30\. 20 MINUTES EARLY/i.test(await bodyText(p)), 20000, 400);
    assert(ok, 'reveal not shown');
  });
  await test('REP-02', 'Backtest table shows 79% / 18 min / 0.13 and control 5%', async () => {
    const t = (await bodyText(p)).replace(/\s+/g, ' ');
    for (const s of ['79%', '18 min', '0.13', '5%']) assert(t.includes(s), `missing ${s}`);
  });
  await test('REP-03', 'Control day: no reveal', async () => {
    await p.select('select.scenario', 'control'); await sleep(300);
    assert(!/MINUTES EARLY/.test(await bodyText(p)), 'reveal on control day');
  });
  await test('REP-04', 'Clicking the chart scrubs the clock', async () => {
    const box = await (await p.$('svg[aria-label="Risk over time"]')).boundingBox();
    await p.mouse.click(box.x + box.width * 0.5, box.y + 40); await sleep(300);
    const clock = await p.$eval('.bignum', (e) => e.textContent); assert(/1[01]:\d\d/.test(clock), clock); return clock;
  });

  // ------------------------------------------------------------------ INSIGHTS
  await go(p, 'insights');
  await test('INS-01', 'Idle cost ₹840 and findings on the two alert rows', async () => {
    const t = await bodyText(p); assert(t.includes('₹840'), 'cost');
    assert((t.match(/Seatbelt off/g) ?? []).length >= 2, 'seatbelt findings'); assert(/Fuel above expected/.test(t), 'fuel mismatch');
  });

  // ------------------------------------------------------------------ TRAINING / SUMMARY / SUPERVISOR
  await go(p, 'training');
  await test('TRN-01', 'Start recommended lesson → steps and quiz; answering shows feedback', async () => {
    await click(p, 'Start lesson'); await sleep(400);
    const t = await bodyText(p); assert(/Steps/.test(t) && /Quick check/.test(t), 'lesson view');
    const opts = await p.$$('button[style*="text-align: left"]'); assert(opts.length, 'no quiz options');
    await opts[1].click(); await sleep(200);
    assert(/Correct!|Not quite/.test(await bodyText(p)), 'no feedback');
  });
  await test('TRN-02', 'Incident → "Turn into a lesson" builds a lesson (LLM or template)', async () => {
    await go(p, 'training'); await click(p, '←').catch(() => {}); await click(p, 'Turn into a lesson');
    const ok = await waitFor(p, async () => /Quick check/.test(await bodyText(p)), 25000, 500);
    assert(ok, 'no lesson'); return (await p.$eval('h2', (e) => e.textContent)).slice(0, 60);
  });
  await test('TRN-03', 'Book an instructor → confirmation', async () => {
    await go(p, 'training'); await click(p, '←').catch(() => {}); await click(p, 'Book an instructor'); await sleep(200);
    assert(/Instructor requested/.test(await bodyText(p)), 'no confirmation');
  });
  await go(p, 'summary');
  await test('SUM-01', 'Summary shows tasks, idle, cost, alerts', async () => {
    const t = await bodyText(p); for (const s of ['Tasks', 'Idle time', 'Idle cost', 'Safety alerts']) assert(t.includes(s), s);
  });
  await test('SUM-02', 'Read it out → generated summary text (Groq or template)', async () => {
    await click(p, 'Read it out');
    const txt = await waitFor(p, async () => { const t = await p.$$eval('p', (ps) => ps.map((x) => x.textContent).find((x) => x.length > 40 && !/Preparing/.test(x))); return t; }, 25000, 500);
    assert(txt, 'no summary'); return txt.slice(0, 90);
  });
  await test('SUM-03', 'WhatsApp link is a wa.me URL with the summary text', async () => {
    const href = await p.$$eval('a', (as) => as.map((a) => a.href).find((h) => h.includes('wa.me')));
    assert(href && href.includes('text='), href); return href.slice(0, 60);
  });
  await go(p, 'supervisor');
  await test('SUP-01', 'Supervisor lists incidents incl. auto-logged', async () => {
    const t = await bodyText(p); assert(/Incidents \((\d+)\)/.test(t) && +t.match(/Incidents \((\d+)\)/)[1] >= 3, t.match(/Incidents \(\d+\)/)?.[0]);
    assert(/Auto-logged/.test(t), 'no auto tag');
  });
  await test('SUP-02', 'Sync incidents → saved on the API', async () => {
    await click(p, 'Sync incidents');
    const msg = await waitFor(p, async () => /Synced \d+/.exec(await bodyText(p))?.[0], 10000);
    assert(msg, 'no synced message');
    const onServer = await p.evaluate(async () => (await (await fetch('/api/incidents')).json()).length);
    assert(onServer >= 3, `server has ${onServer}`); return `${msg}; server has ${onServer}`;
  });
  await test('ERR-01', 'No uncaught page errors during the full flow', async () => { assert(!p.errors.length, p.errors.join(' | ')); });
  await browser.close();
}

// ------------------------------------------------------------------ I18N: no raw keys / placeholders in any language
if (want('i18n')) {
  const { browser, page: p } = await launch();
  await login(p);
  const RAW = /\b(nav|login|dashboard|status|factor|state|safety|alert|nudge|incident|voice|common|heat|dir|severity|replay|cause|insights|finding|training|summary|supervisor)\.[a-z][A-Za-z_]+\b/;
  for (const [lang, label] of [['en', 'English'], ['hi', 'Hindi'], ['ta', 'Tamil'], ['kn', 'Kannada']]) {
    await test(`I18N-${lang}`, `${label}: all 7 screens have no raw keys or {{placeholders}}`, async () => {
      await p.select('header select', lang);
      const bad = [];
      for (const r of ['dashboard', 'safety', 'replay', 'insights', 'training', 'summary', 'supervisor']) {
        await go(p, r); await p.select('header select', lang); await sleep(250);
        const t = await bodyText(p);
        const m = RAW.exec(t) ?? /\{\{\w+\}\}/.exec(t);
        if (m) bad.push(`${r}: ${m[0]}`);
      }
      assert(!bad.length, bad.join(', '));
    });
  }
  await browser.close();
}

// ------------------------------------------------------------------ PHONE WIDTH
if (want('mobile')) {
  const { browser, page: p } = await launch({ width: 390 });
  await login(p);
  await test('MOB-01', 'No horizontal overflow at 390 px on any screen', async () => {
    const bad = [];
    for (const r of ['dashboard', 'safety', 'replay', 'insights', 'training', 'summary', 'supervisor']) {
      await go(p, r); const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 392) bad.push(`${r}=${w}px`);
    }
    assert(!bad.length, bad.join(', '));
  });
  await test('MOB-02', 'Tap targets ≥ 44 px on primary buttons (Today)', async () => {
    await go(p, 'dashboard');
    const small = await p.$$eval('.actions button, .voicebtn', (bs) => bs.filter((b) => b.getBoundingClientRect().height < 44).length);
    assert(!small, `${small} small`);
  });
  await browser.close();
}

// ------------------------------------------------------------------ OFFLINE (API unreachable)
if (want('offline')) {
  const { browser, page: p } = await launch();
  await p.setRequestInterception(true);
  p.on('request', (r) => (new URL(r.url()).pathname.startsWith('/api/') ? r.abort() : r.continue()));
  await login(p);
  await test('OFF-01', 'API down: Today/Safety/Replay still work', async () => {
    await go(p, 'dashboard'); assert(/Range:/.test(await bodyText(p)), 'today');
    await go(p, 'replay'); await click(p, '08:50'); await p.select('select[aria-label="speed"]', '8');
    assert(await waitFor(p, async () => /MINUTES EARLY/.test(await bodyText(p)), 20000, 400), 'replay');
  });
  await test('OFF-02', 'API down: summary falls back to on-device template', async () => {
    await go(p, 'summary'); await click(p, 'Read it out');
    const txt = await waitFor(p, async () => p.$$eval('p', (ps) => ps.map((x) => x.textContent).find((x) => x.length > 30 && !/Preparing/.test(x))), 10000, 400);
    assert(txt, 'no fallback text'); return txt.slice(0, 80);
  });
  await test('OFF-03', 'API down: incidents stay on device and sync reports offline', async () => {
    await go(p, 'safety'); await p.type('textarea', 'Offline test incident'); await click(p, 'Log incident');
    await go(p, 'supervisor'); await click(p, 'Sync incidents');
    assert(await waitFor(p, async () => /Saved on device/.test(await bodyText(p)), 8000), 'no offline message');
  });
  await test('OFF-04', 'API down: training lesson from incident uses built-in lesson', async () => {
    await go(p, 'training'); await click(p, 'Turn into a lesson');
    assert(await waitFor(p, async () => /Quick check/.test(await bodyText(p)), 10000), 'no lesson');
  });
  await browser.close();
}

// ------------------------------------------------------------------ VOICE (simulated microphone via Sarvam)
if (want('voice')) {
  const cases = [
    ['VOI-01', 'hi_next', 'हिन्दी', 'Hindi "what is the next task?" → spoken next task', (t) => /अगला काम:/.test(t)],
    ['VOI-02', 'hi_eta', 'हिन्दी', 'Hindi "how long will it take?" → minutes', (t) => /मिनट/.test(t)],
    ['VOI-03', 'hi_why', 'हिन्दी', 'Hindi "why the delay?" → top reason', (t) => /\+\d+ मिनट/.test(t)],
    ['VOI-04', 'hi_incident', 'हिन्दी', 'Hindi "a man came behind the machine" → incident logged', (t) => /दर्ज किया/.test(t)],
    ['VOI-05', 'hi_done', 'हिन्दी', 'Hindi "task done" → asks for confirmation', (t) => /कन्फर्म या कैंसल/.test(t)],
    ['VOI-06', 'hi_mayday', 'हिन्दी', 'Hindi "bachao" → emergency alert', (t) => /आपातकाल|Emergency/.test(t)],
    ['VOI-07', 'ta_next', 'தமிழ்', 'Tamil "next task?" → reply', (t) => t.length > 5 && !/…|→/.test(t)],
    ['VOI-08', 'kn_next', 'ಕನ್ನಡ', 'Kannada "next task?" → reply', (t) => t.length > 5 && !/…|→/.test(t)],
    ['VOI-09', 'en_eta', 'English', 'English "how long will this take?" → minutes', (t) => /minutes/.test(t)],
    ['VOI-10', 'en_lesson', 'English', 'English "start my training lesson" → opens Training', (t, p) => p.url().includes('/training')],
  ];
  for (const [id, clip, lang, name, check] of cases) {
    if (process.env.IDS && !process.env.IDS.split(',').includes(id)) continue;
    const { browser, page: p } = await launch({ audio: clip });
    await test(id, name, async () => {
      await login(p, lang); await sleep(800);
      // Toggle mic: press once to start, wait for 'Listening' + the spoken clip, press again to stop.
      await p.click('.voicebtn');
      await waitFor(p, async () => /Listening|सुन रहा|கேட்கிறேன்|ಕೇಳುತ್ತಿದ್ದೇನೆ/.test(await p.$eval('.voicetext', (e) => e.textContent).catch(() => '')), 10000, 100);
      await sleep(3500);
      await p.click('.voicebtn');
      await waitFor(p, async () => p.api.some((a) => a.startsWith('/speech/stt')), 15000, 300);
      let t = '';
      const ok = await waitFor(p, async () => { t = await p.$eval('.voicetext', (e) => e.textContent).catch(() => ''); return check(t, p); }, 20000, 400);
      const heard = t;
      assert(ok, `shown: "${heard}" api: ${[...new Set(p.api)].join(',')}`);
      if (clip === 'hi_incident') assert(/near|person|worker|machine|proximity/i.test(await (await go(p, 'safety'), bodyText(p))), 'incident not in log');
      if (clip === 'hi_mayday') assert(/Emergency|आपातकाल/.test(await banner(p)), 'no banner');
      return `"${heard.slice(0, 70)}" via ${[...new Set(p.api.filter((a) => /speech|llm/.test(a)))].join(',')}`;
    });
    await browser.close();
  }
}

// ------------------------------------------------------------------ REPORT
fs.writeFileSync(`${DIR}/results-${ONLY ?? 'all'}.json`, JSON.stringify(results, null, 2));
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
