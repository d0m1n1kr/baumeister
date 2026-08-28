// Smoke-Test für den Umzug (docs/umzug/): Der alte Pfad /tiny-towns/ trägt bei
// vielen Leuten noch einen installierten Service Worker mit vollem Cache. Der
// beantwortet jede Navigation aus dem Cache — die Weiche würde nie geladen.
//
// Hier wird genau das nachgestellt: ein lokaler Server mit einer „alten App"
// samt cachendem Worker und einer „neuen App", dann werden die echten Dateien
// aus docs/umzug/ eingespielt und geprüft, dass der Browser wirklich umzieht.
//
// Die beiden wichtigsten Gegenproben stecken mit drin:
//   1. Ohne Kill-Switch fängt der alte Worker die Navigation weiter ab.
//   2. Worker und Cache der NEUEN App überleben — github.io ist EIN Ursprung,
//      ein unsauberes Aufräumen würde die frische Installation mitreißen.
//
// Aufruf: node scripts/smoke-umzug.mjs
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = fs.mkdtempSync('/tmp/umzug-');
const ALT = path.join(WURZEL, 'tiny-towns');
const NEU = path.join(WURZEL, 'baumeister');
fs.mkdirSync(ALT); fs.mkdirSync(NEU);

const PORT = 4399;
const BASIS = `http://localhost:${PORT}`;

let fehler = 0;
function pruefe(ok, text) {
  console.log(`${ok ? '✓' : '✗'} ${text}`);
  if (!ok) fehler++;
}

// ---------- Testserver ----------
const TYPEN = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const datei = path.join(WURZEL, p);
  if (!fs.existsSync(datei) || fs.statSync(datei).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); return;
  }
  res.writeHead(200, {
    'content-type': TYPEN[path.extname(datei)] ?? 'application/octet-stream',
    'cache-control': 'no-cache'
  });
  res.end(fs.readFileSync(datei));
});
await new Promise((r) => server.listen(PORT, r));

// ---------- Zustand 1: alte App mit cachendem Worker ----------
fs.writeFileSync(path.join(NEU, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Baumeister</title>
   <body><h1 id="neu">NEUE APP</h1>
   <script>navigator.serviceWorker.register('/baumeister/sw.js', { scope: '/baumeister/' });</script>`);
fs.writeFileSync(path.join(NEU, 'sw.js'), `
self.addEventListener('install', (e) => e.waitUntil((async () => {
  const c = await caches.open('workbox-precache-v2-' + self.registration.scope);
  await c.put('/baumeister/', new Response('neu', { headers: { 'content-type': 'text/html' } }));
  await self.skipWaiting();
})()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
`);

fs.writeFileSync(path.join(ALT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Tiny Towns</title>
   <body><h1 id="alt">ALTE APP</h1>
   <script>navigator.serviceWorker.register('/tiny-towns/sw.js', { scope: '/tiny-towns/' });</script>`);

fs.writeFileSync(path.join(ALT, 'sw.js'), `
const CACHE = 'workbox-precache-v2-' + self.registration.scope;
const SEITE = '<!doctype html><meta charset="utf-8"><title>Tiny Towns</title><body><h1 id="alt">ALTE APP (aus dem Cache)</h1>';
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.put('/tiny-towns/', new Response(SEITE, { headers: { 'content-type': 'text/html' } }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => (await caches.match('/tiny-towns/')) || fetch(e.request))());
  }
});
`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const kontext = await browser.newContext();
let seite = await kontext.newPage();

await seite.goto(`${BASIS}/baumeister/`);
await seite.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
pruefe(true, 'Neue App unter /baumeister/ hat einen eigenen Worker samt Cache');

// Marke im Cache der neuen App. Sie wird von deren install-Handler NICHT neu
// angelegt — verschwindet sie, wurde der Cache unterwegs gelöscht (und nur
// durch eine Neu-Installation wieder aufgebaut). Genau das soll nicht passieren.
await seite.evaluate(async () => {
  const c = await caches.open('workbox-precache-v2-' + location.origin + '/baumeister/');
  await c.put('/baumeister/marke', new Response('marke'));
});

await seite.goto(`${BASIS}/tiny-towns/`);
await seite.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
pruefe(true, 'Alter Service Worker ist installiert und steuert die Seite');

// Gegenprobe: Ohne Kill-Switch bleibt die alte App bestehen — auch wenn
// index.html am Server längst die Weiche wäre.
fs.writeFileSync(path.join(ALT, 'index.html'), '<!doctype html><meta charset="utf-8"><body><h1 id="weiche">WEICHE OHNE KILL-SWITCH</h1>');
await seite.reload({ waitUntil: 'load' });
await seite.waitForTimeout(500);
const gefangen = await seite.textContent('body');
pruefe(/ALTE APP/.test(gefangen), `Gegenprobe: alter Worker fängt die Navigation ab (${gefangen.trim().slice(0, 40)})`);

// ---------- Zustand 2: Weiche + selbstzerstörender Worker ----------
const wurzelProjekt = new URL('../docs/umzug/', import.meta.url).pathname;
const weiche = fs.readFileSync(path.join(wurzelProjekt, 'index.html'), 'utf8')
  .replaceAll('https://d0m1n1kr.github.io/baumeister/', `${BASIS}/baumeister/`);
fs.writeFileSync(path.join(ALT, 'index.html'), weiche);
fs.copyFileSync(path.join(wurzelProjekt, 'sw.js'), path.join(ALT, 'sw.js'));

// Genau das, was der Nutzer tut: die alte Adresse frisch aufrufen — mit Fracht.
// Frische Seite im selben Kontext: der alte Worker ist noch registriert.
await seite.close();
seite = await kontext.newPage();
seite.on('framenavigated', (f) => { if (f === seite.mainFrame()) console.log('   → ' + f.url()); });
await seite.goto(`${BASIS}/tiny-towns/#daily=2026-08-27&mode=land`).catch(() => {});
await seite.waitForURL(`${BASIS}/baumeister/**`, { timeout: 20000 });
pruefe(true, `Landet auf der neuen Adresse: ${seite.url()}`);
pruefe(seite.url() === `${BASIS}/baumeister/#daily=2026-08-27&mode=land`, 'Fragment bleibt erhalten');
pruefe((await seite.textContent('#neu')) === 'NEUE APP', 'Neue App wird gezeigt');

// ---------- Zustand 3: nichts bleibt zurück ----------
const rest = await seite.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  const namen = await caches.keys();
  const marke = await caches.match('/baumeister/marke');
  return { worker: regs.map((r) => r.scope), caches: namen, marke: !!marke };
});
pruefe(
  !rest.worker.some((s) => s.includes('/tiny-towns/')),
  `Alter Worker ist weg (${JSON.stringify(rest.worker)})`
);
pruefe(
  !rest.caches.some((n) => n.includes('/tiny-towns/')),
  `Alte Caches sind weg (${JSON.stringify(rest.caches)})`
);
pruefe(
  rest.worker.some((s) => s.includes('/baumeister/')),
  'Gegenprobe: der Worker der NEUEN App überlebt den Umzug'
);
pruefe(
  rest.marke,
  'Gegenprobe: der Cache-Inhalt der NEUEN App überlebt den Umzug unangetastet'
);

// ---------- Zustand 4: erneuter Aufruf der alten Adresse ----------
await seite.goto(`${BASIS}/tiny-towns/`).catch(() => {});
await seite.waitForURL(`${BASIS}/baumeister/**`, { timeout: 15000 });
pruefe(true, 'Zweiter Aufruf der alten Adresse leitet ebenfalls weiter');

await browser.close();
server.close();
fs.rmSync(WURZEL, { recursive: true, force: true });
console.log(fehler === 0 ? '\nAlles grün.' : `\n${fehler} Fehler.`);
process.exit(fehler === 0 ? 0 : 1);
