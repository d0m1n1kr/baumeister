// End-to-End-Smoke-Test (Chromium, iPad-Viewport):
// Partie anlegen → 3 Runden Material platzieren (Drag & Drop) → Hütte bauen →
// Reload → Spielstand wiederhergestellt.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/`;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

// Direkt die Binärdatei starten (nicht über npx): sonst überlebt der
// eigentliche Vite-Prozess das Beenden der Hülle und blockiert den Port.
const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore'
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) return;
    } catch {
      /* Server startet noch */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  fail('Preview-Server nicht erreichbar');
}

let page;

async function dragChip(player, square = null) {
  const chip = page.locator(`.slot:has([data-player="${player}"]) .pendingWrap .chip`);
  await chip.waitFor({ timeout: 5000 });
  const from = await chip.boundingBox();
  let to = null;
  if (square !== null) {
    to = await page.locator(`[data-player="${player}"][data-square="${square}"]`).boundingBox();
  } else {
    const cells = page.locator(`[data-player="${player}"][data-square]`);
    for (let i = 0; i < (await cells.count()); i++) {
      const cell = cells.nth(i);
      if ((await cell.locator('.res, .building').count()) === 0) {
        to = await cell.boundingBox();
        break;
      }
    }
  }
  if (!from || !to) fail(`Drag-Quelle/-Ziel für Spieler ${player} nicht gefunden`);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function playRound(resourceTitle, p0Square, finish = true) {
  await page.locator(`.picker .chip[title="${resourceTitle}"]`).click();
  await dragChip(0, p0Square);
  await dragChip(1);
  if (finish) {
    const done = page.locator('button', { hasText: '✓ Fertig' });
    await done.first().click();
    await done.first().click();
    await page.locator('.picker').waitFor({ timeout: 5000 });
  }
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  page = await browser.newPage({ viewport: { width: 1180, height: 820 }, locale: 'de-DE' });
  page.on('pageerror', (e) => fail(`Seitenfehler: ${e.message}`));
  await page.goto(BASE_URL);

  // Setup: 2 Spieler, ohne Monumente, mit Fortune-Erweiterung
  await page.locator('.seg button', { hasText: '2' }).click();
  await page.locator('.toggle input[type="checkbox"]').first().click();
  await page.locator('.expRow', { hasText: 'Fortune' }).locator('input').click();
  await page.locator('button', { hasText: 'Los geht’s!' }).click();
  const chests = await page.locator('.chest').count();
  if (chests !== 2) fail(`Erwartet 2 Münz-Truhen (Fortune aktiv), gefunden: ${chests}`);
  console.log('✓ Setup (mit Fortune: Truhen sichtbar)');

  // Marken-Beschriftung: Lange Namen (Themen und andere Sprachen liefern sie)
  // dürfen nicht über die Marke hinaushängen — sie wächst zur Kapsel, der Text
  // bleibt einzeilig. Und auf dunklem Material muss der Text hell sein.
  const chipFit = await page.evaluate(() => {
    const label = document.querySelector('.picker .resLabel');
    const chip = label.closest('.chip');
    const before = chip.getBoundingClientRect().width;
    label.textContent = 'Drachenschuppenglas';
    label.className = 'resLabel xlong';
    const ink = (res) => {
      const el = document.querySelector(`.picker .resLabel[data-res="${res}"]`);
      return getComputedStyle(el).color;
    };
    return {
      before,
      after: chip.getBoundingClientRect().width,
      clipped: label.scrollWidth > label.clientWidth + 1,
      lines: label.getClientRects().length,
      woodInk: ink('wood'),
      stoneInk: ink('stone')
    };
  });
  if (chipFit.clipped) fail('Marke: langer Name wird abgeschnitten');
  if (chipFit.after <= chipFit.before) fail('Marke: wächst bei langem Namen nicht mit');
  if (chipFit.lines !== 1) fail(`Marke: Beschriftung bricht um (${chipFit.lines} Zeilen)`);
  if (chipFit.woodInk !== 'rgb(255, 255, 255)') fail(`Marke: Holz-Text nicht hell (${chipFit.woodInk})`);
  if (chipFit.stoneInk === 'rgb(255, 255, 255)') fail('Marke: Stein-Text sollte dunkel sein');
  console.log('✓ Marken-Beschriftung: einzeilig, ohne Überlauf, Kontrast je Material');

  // Hütten-Muster für Spieler 0: Weizen(0,1), Ziegel(1,0), Glas(1,1)
  await playRound('Weizen', 1);

  // Runde 2: Platzieren per TIPP statt Drag, dann Verschieben per Tipp
  await page.locator('.picker .chip[title="Ziegel"]').click();
  await page.locator('[data-player="0"][data-square="8"]').click(); // Tipp platziert
  await page.locator('[data-player="0"][data-square="4"]').click(); // Tipp verschiebt
  const moved = await page.locator('[data-player="0"][data-square="4"] .res').count();
  if (moved !== 1) fail('Tipp-Platzieren/Verschieben fehlgeschlagen');
  await dragChip(1);
  const done2 = page.locator('button', { hasText: '✓ Fertig' });
  await done2.first().click();
  // Regression: Nach „Fertig" darf der eigene Bauen-Knopf nicht mehr da sein
  const bauen = await page.locator('button', { hasText: '🔨' }).count();
  if (bauen !== 1) fail(`Nach „Fertig" erwartet 1 Bauen-Knopf, gefunden: ${bauen}`);
  await done2.first().click();
  await page.locator('.picker').waitFor({ timeout: 5000 });
  console.log('✓ Platzieren per Tipp + Verschieben, „Fertig" sperrt das Bauen');

  await playRound('Glas', 5, false);
  console.log('✓ 3 Runden Platzierung (Drag & Tipp)');

  // Hütte bauen: Bauen → Felder 1,4,5 markieren → Match antippen → Bauplatz 5
  const corner0 = page.locator('.slot:has([data-player="0"])');
  await corner0.locator('button', { hasText: 'Bauen' }).click();
  for (const sq of [1, 4, 5]) {
    await page.locator(`[data-player="0"][data-square="${sq}"]`).click();
  }
  await corner0.locator('.matches .mini').first().click();
  await page.locator('[data-player="0"][data-square="5"]').click();
  await corner0.locator('[data-square="5"] .building').waitFor({ timeout: 5000 });
  console.log('✓ Muster markiert und Hütte gebaut');

  // Reload → Spielstand wiederhergestellt
  await page.reload();
  await page.locator('button', { hasText: 'Weiterspielen' }).click();
  await corner0.locator('[data-square="5"] .building').waitFor({ timeout: 5000 });
  const p1Res = await page.locator(`[data-player="1"][data-square] .res`).count();
  if (p1Res !== 3) fail(`Nach Reload: erwartet 3 Materialien bei Spieler 2, gefunden: ${p1Res}`);
  console.log('✓ Persistenz (Reload + Weiterspielen)');

  // ---------- Safe-Area: nutzt die App die ganze Höhe? ----------
  // Mit NACHGEBILDETEN iOS-Insets (oben 59, unten 34 wie ein iPhone mit
  // Dynamic Island in der installierten PWA). Der Fehler trat zweimal auf,
  // beide Male unsichtbar im Browser — hier wird er messbar.
  const insetPage = await browser.newPage({ viewport: { width: 393, height: 852 }, locale: 'de-DE' });
  insetPage.on('pageerror', (e) => fail(`Safe-Area: Seitenfehler: ${e.message}`));
  await insetPage.goto(BASE_URL);
  await insetPage.addStyleTag({
    content: ':root { --safe-bottom: 34px; } #app { padding-top: 59px; }'
  });
  await insetPage.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
  await insetPage.locator('.seg button', { hasText: '1' }).first().click();
  await insetPage.locator('section button.big').click();
  await insetPage.locator('.boardWrap').waitFor({ timeout: 5000 });
  const layout = await insetPage.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().bottom) : null;
    };
    const safe =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
    return { vh: innerHeight, app: rect('#app'), table: rect('.table'), panel: rect('.panel'), safe };
  });
  if (layout.app !== layout.vh) {
    fail(`Safe-Area: #app endet ${layout.vh - layout.app}px über dem Bildschirmrand`);
  }
  if (layout.vh - layout.table > 1) {
    fail(`Safe-Area: Spieltisch endet ${layout.vh - layout.table}px zu früh`);
  }
  if (layout.vh - layout.panel > layout.safe + 8) {
    fail(`Safe-Area: toter Streifen unter dem Panel (${layout.vh - layout.panel}px)`);
  }
  console.log('✓ Safe-Area: volle Höhe genutzt, unten nur der Home-Indicator-Rand');
  await insetPage.close();

  // ---------- Installierte iOS-PWA ----------
  // Nachgebildet wird die am Gerät gemessene Lage: Bildschirm 874, gemeldeter
  // Viewport 812, oberer Inset 62. Die Hülle bleibt am Viewport (alles darunter
  // zeichnet die Plattform nicht), und alle Bedienelemente müssen hineinpassen.
  const pwaContext = await browser.newContext({
    viewport: { width: 402, height: 812 },
    screen: { width: 402, height: 874 },
    hasTouch: true,
    locale: 'de-DE'
  });
  const pwaPage = await pwaContext.newPage();
  pwaPage.on('pageerror', (e) => fail(`iOS-PWA: Seitenfehler: ${e.message}`));
  // Insets ins HTML einsetzen — sie müssen VOR dem ersten Skript gelten,
  // denn die Höhenmessung läuft beim Start
  const INSET_STYLE =
    '<style>:root{--safe-raw-top:62px;--safe-bottom:34px}#app{padding-top:62px}</style>';
  await pwaPage.route(BASE_URL, async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace('</head>', `${INSET_STYLE}</head>`);
    await route.fulfill({ response: res, body, headers: res.headers() });
  });
  await pwaPage.goto(BASE_URL);
  await pwaPage.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
  await pwaPage.locator('.seg button', { hasText: '1' }).first().click();
  await pwaPage.locator('section button.big').click();
  await pwaPage.locator('.boardWrap').waitFor({ timeout: 5000 });
  const pwa = await pwaPage.evaluate(() => {
    const bottom = (sel) => {
      const el = document.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().bottom) : null;
    };
    return {
      app: bottom('#app'),
      table: bottom('.table'),
      panel: bottom('.panel'),
      screenH: screen.height
    };
  });
  // Die Hülle bleibt am Layout-Viewport: Inhalt darunter wäre am Gerät
  // unsichtbar (v2.4.5 hatte sie auf Bildschirmhöhe wachsen lassen — falsch).
  if (pwa.app !== 812) fail(`iOS-PWA: Hülle endet bei ${pwa.app}, erwartet 812 (Viewport)`);
  if (pwa.table !== 812) fail(`iOS-PWA: Spieltisch endet bei ${pwa.table}, erwartet 812`);
  if (812 - pwa.panel > 42) fail(`iOS-PWA: toter Streifen unter dem Panel (${812 - pwa.panel}px)`);
  console.log(`✓ iOS-PWA: Hülle bleibt am Viewport (${pwa.app}), Panel endet ${812 - pwa.panel}px darüber`);

  // Am Handy muss das Panel ohne Scrollen reichen — sonst ist der letzte Knopf
  // (Monument) unerreichbar
  await pwaPage.locator('.aliceBtn').first().click(); // Alice-Modus: mehr Kartenhöhe
  await pwaPage.waitForTimeout(150);
  const fit = await pwaPage.evaluate(() => {
    const panel = document.querySelector('.panel');
    const last = panel.lastElementChild;
    return {
      overflow: panel.scrollHeight - panel.clientHeight,
      lastBottom: Math.round(last.getBoundingClientRect().bottom),
      panelBottom: Math.round(panel.getBoundingClientRect().bottom)
    };
  });
  if (fit.overflow > 0) fail(`iOS-PWA: Panel läuft über (${fit.overflow}px verdeckt)`);
  if (fit.lastBottom > fit.panelBottom) {
    fail(`iOS-PWA: letztes Bedienelement ist abgeschnitten (${fit.lastBottom} > ${fit.panelBottom})`);
  }
  console.log('✓ iOS-PWA: alle Bedienelemente passen ohne Scrollen ins Panel');

  // Fingerscrollen muss funktionieren: touch-action an html/body wirkt über die
  // ganze Vorfahrenkette — mit „none" ließ sich kein Kind mehr scrollen.
  const cards = await pwaPage.evaluate(() => {
    const el = document.querySelector('.cards');
    return { over: el.scrollHeight - el.clientHeight };
  });
  if (cards.over <= 0) fail('iOS-PWA: Kartenraster läuft nicht über — Test greift nicht');
  const cardBox = await pwaPage.locator('.cards').boundingBox();
  const touch = await pwaContext.newCDPSession(pwaPage);
  const tx = cardBox.x + cardBox.width / 2;
  const ty = cardBox.y + cardBox.height - 20;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
  for (let i = 1; i <= 8; i++) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: tx, y: ty - i * 10 }]
    });
    await pwaPage.waitForTimeout(16);
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pwaPage.waitForTimeout(400);
  const scrolled = await pwaPage.evaluate(() => document.querySelector('.cards').scrollTop);
  if (scrolled <= 0) fail('iOS-PWA: Kartenraster lässt sich nicht mit dem Finger scrollen');
  console.log(`✓ iOS-PWA: Fingerscrollen im Kartenraster wirkt (${scrolled}px)`);

  await pwaContext.close();

  console.log('Smoke-Test bestanden.');
} finally {
  await browser?.close();
  server.kill();
}
