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

  // Der Versionsstempel im Fußbereich ist der Ausweg aus einem Tab, der auf
  // seiner alten Fassung sitzen bleibt: Antippen prüft von Hand nach.
  const stamp = page.locator('footer button.stamp');
  await stamp.waitFor({ timeout: 5000 });
  if (!(await stamp.textContent()).includes('v')) fail('Versionsstempel zeigt keine Version');
  await stamp.dispatchEvent('pointerup');
  await page.locator('footer button.stamp', { hasText: 'aktuell' }).waitFor({ timeout: 8000 });
  console.log('✓ Update-Prüfung von Hand über den Versionsstempel');

  // Startbildschirm: Der Start-Knopf muss auf jedem Gerät sichtbar sein, und
  // die Optionen müssen in einem gemeinsamen Raster stehen — Titel und
  // Beschreibung bündig, Spielerzeilen spaltenweise ausgerichtet.
  for (const [label, w, h] of [
    ['Handy', 402, 874],
    ['Handy quer', 874, 402],
    ['Tablet', 1024, 1366],
    ['Tablet quer', 1180, 820]
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'de-DE' });
    const p2 = await ctx.newPage();
    p2.on('pageerror', (e) => fail(`Startbildschirm ${label}: Seitenfehler: ${e.message}`));
    await p2.goto(BASE_URL);
    await p2.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    const measure = () => p2.evaluate(() => {
      const x = (el) => Math.round(el.getBoundingClientRect().left);
      const wOf = (el) => Math.round(el.getBoundingClientRect().width);
      const start = document.querySelector('.bar button.big').getBoundingClientRect();
      const cards = [...document.querySelectorAll('.card')].map((card) => ({
        names: [...card.querySelectorAll('.optName')].map(x),
        descs: [...card.querySelectorAll('.optDesc')].map(x),
        widths: [...card.querySelectorAll('.optText')].map(wOf)
      }));
      const col = (sel) => [...document.querySelectorAll(`.players ${sel}`)].map(x);
      const byRow = new Map();
      for (const el of document.querySelectorAll('.players > *')) {
        const top = Math.round(el.getBoundingClientRect().top);
        byRow.set(top, (byRow.get(top) ?? 0) + 1);
      }
      return {
        start: { top: Math.round(start.top), bottom: Math.round(start.bottom) },
        vh: innerHeight,
        cards,
        inputs: col('input'),
        selects: col('select'),
        devices: col('.deviceToggle'),
        rows: [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n)
      };
    });
    // Alle drei Zeilenformen: nur Name (Solo), Name + Ecke, Name + Ecke + Gerät.
    // Das Raster muss in jeder davon genauso viele Spalten haben, wie die Zeile
    // Felder rendert — sonst rutscht die nächste Zeile in die freien Spalten.
    const forms = [
      ['4 Spieler', async () => {}],
      ['eigene Geräte', async () => p2.locator('.seg button', { hasText: 'Mit eigenen' }).click()],
      ['Solo', async () => p2.locator('.seg button', { hasText: '1' }).first().click()]
    ];
    for (const [form, setup] of forms) {
      await setup();
      const geo = await measure();
      const where = `${label}/${form}`;
      if (geo.start.top < 0 || geo.start.bottom > geo.vh) {
        fail(`Startbildschirm ${where}: Start-Knopf nicht sichtbar (${geo.start.top}–${geo.start.bottom} in ${geo.vh})`);
      }
      for (const card of geo.cards) {
        const same = (xs) => xs.length === 0 || xs.every((v) => v === xs[0]);
        if (!same(card.names)) fail(`Startbildschirm ${where}: Options-Titel nicht bündig (${card.names})`);
        if (!same(card.descs)) fail(`Startbildschirm ${where}: Beschreibungen nicht bündig (${card.descs})`);
        if (!same(card.widths)) fail(`Startbildschirm ${where}: Optionen unterschiedlich breit (${card.widths})`);
      }
      for (const [what, xs] of [['Namen', geo.inputs], ['Ecken', geo.selects], ['Geräte', geo.devices]]) {
        if (xs.length && !xs.every((v) => v === xs[0])) {
          fail(`Startbildschirm ${where}: Spalte „${what}" nicht ausgerichtet (${xs})`);
        }
      }
      // Zeilenweise Vollständigkeit: Jede Zeile muss auf derselben Höhe stehen
      // wie ihre Nachbarfelder — versetzte Felder fallen so sofort auf.
      if (geo.rows.some((r) => r.length !== geo.rows[0].length)) {
        fail(`Startbildschirm ${where}: Spielerzeilen unterschiedlich besetzt (${JSON.stringify(geo.rows)})`);
      }
    }
    await ctx.close();
  }
  console.log('✓ Startbildschirm: Start-Knopf sichtbar, Optionen und Spielerzeilen bündig');

  // Installations-Hinweis: Auf iOS gibt es keine Schnittstelle dafür, also muss
  // dort eine Anleitung erscheinen — und einmal weggeklickt bleibt sie weg.
  {
    const iosCtx = await browser.newContext({
      viewport: { width: 402, height: 874 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
      hasTouch: true,
      locale: 'de-DE'
    });
    const ios = await iosCtx.newPage();
    ios.on('pageerror', (e) => fail(`Installation: Seitenfehler: ${e.message}`));
    await ios.goto(BASE_URL);
    await ios.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    const banner = ios.locator('.installHint');
    await banner.waitFor({ timeout: 5000 });
    // Auf iOS führt kein Dialog zum Ziel: Der Knopf klappt die Schritte auf.
    if ((await ios.locator('.installSteps').count()) !== 0) fail('Installation: Schritte schon offen');
    await banner.locator('.installGo').dispatchEvent('pointerup');
    await ios.locator('.installSteps li').first().waitFor({ timeout: 3000 });
    const steps = await ios.locator('.installSteps li').count();
    if (steps !== 2) fail(`Installation: ${steps} Schritte statt 2`);
    // Der Hinweis darf den Start-Knopf nicht verdrängen
    const startBox = await ios.locator('.bar button.big').boundingBox();
    if (startBox.y + startBox.height > 874) fail('Installation: Start-Knopf aus dem Bild geschoben');
    await banner.locator('.hintClose').dispatchEvent('pointerup');
    if ((await banner.count()) !== 0) fail('Installation: ✕ blendet den Hinweis nicht aus');
    await ios.reload();
    await ios.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    if ((await ios.locator('.installHint').count()) !== 0) {
      fail('Installation: weggeklickter Hinweis kommt wieder');
    }
    console.log('✓ Installation: iOS-Anleitung mit 2 Schritten, weggeklickt bleibt weg');
    await iosCtx.close();
  }

  // Gegenprobe: Ohne iOS und ohne Chromium-Ereignis (das kommt im Test nicht)
  // darf gar kein Hinweis stehen — sonst wäre er ein Fehlalarm am Rechner.
  {
    const plain = await browser.newPage({ viewport: { width: 1180, height: 820 }, locale: 'de-DE' });
    await plain.goto(BASE_URL);
    await plain.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    if ((await plain.locator('.installHint').count()) !== 0) {
      fail('Installation: Hinweis erscheint, obwohl kein Weg zum Installieren offensteht');
    }
    console.log('✓ Installation: kein Hinweis, wo es keinen Weg gibt');

    // Chromium-Weg: Das echte `beforeinstallprompt` feuert nur unter Bedingungen,
    // die sich im Test nicht herstellen lassen (installierbare Herkunft,
    // Nutzerinteraktion). Ein nachgebautes Ereignis prüft aber genau das, was
    // hier unser Code ist: merken, anbieten, abspielen, danach verschwinden.
    await plain.evaluate(() => {
      const e = new Event('beforeinstallprompt');
      e.prompt = () => {
        window.__installPrompted = true;
        return Promise.resolve();
      };
      window.dispatchEvent(e);
    });
    const offer = plain.locator('.installHint .installGo');
    await offer.waitFor({ timeout: 3000 });
    const label = (await offer.textContent()).trim();
    if (label !== 'Installieren') fail(`Installation: Chromium-Knopf heißt „${label}"`);
    if ((await plain.locator('.installSteps').count()) !== 0) {
      fail('Installation: Chromium zeigt die iOS-Anleitung');
    }
    await offer.dispatchEvent('pointerup');
    await plain.waitForFunction(() => window.__installPrompted === true, null, { timeout: 3000 });
    await plain.locator('.installHint').waitFor({ state: 'detached', timeout: 3000 });
    console.log('✓ Installation: Chromium-Dialog wird angeboten, abgespielt und danach still');
    await plain.close();
  }

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
  await insetPage.locator('.bar button.big').click();
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
  // Nachgebildet wird die Lage am Gerät (iPhone mit Dynamic Island): Bildschirm
  // und Viewport 874, oberer Inset 62, unterer 34. Erwartet wird, dass html,
  // Hülle und Spieltisch die volle Höhe nutzen und alle Bedienelemente
  // hineinpassen — ohne Scrollen.
  const pwaContext = await browser.newContext({
    viewport: { width: 402, height: 874 },
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
  await pwaPage.locator('.bar button.big').click();
  await pwaPage.locator('.boardWrap').waitFor({ timeout: 5000 });
  const pwa = await pwaPage.evaluate(() => {
    const bottom = (sel) => {
      const el = document.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().bottom) : null;
    };
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;height:100vh;visibility:hidden';
    document.body.appendChild(probe);
    const vh = Math.round(probe.getBoundingClientRect().height);
    probe.remove();
    return {
      app: bottom('#app'),
      table: bottom('.table'),
      panel: bottom('.panel'),
      htmlH: Math.round(document.documentElement.getBoundingClientRect().height),
      cover: document.documentElement.dataset.cover !== undefined,
      vh,
      screenH: screen.height
    };
  });
  // Insets gemeldet → html/body dürfen 100vh hoch sein, die Hülle füllt sie
  if (!pwa.cover) fail('iOS-PWA: data-cover fehlt trotz gemeldetem Inset');
  if (pwa.htmlH !== pwa.vh) fail(`iOS-PWA: html ist ${pwa.htmlH} hoch, erwartet 100vh = ${pwa.vh}`);
  if (pwa.app !== pwa.vh) fail(`iOS-PWA: Hülle endet bei ${pwa.app}, erwartet ${pwa.vh}`);
  if (pwa.table !== pwa.vh) fail(`iOS-PWA: Spieltisch endet bei ${pwa.table}, erwartet ${pwa.vh}`);
  if (pwa.vh - pwa.panel > 42) fail(`iOS-PWA: toter Streifen unter dem Panel (${pwa.vh - pwa.panel}px)`);
  console.log(`✓ iOS-PWA: html/Hülle nutzen 100vh (${pwa.vh}), Panel endet ${pwa.vh - pwa.panel}px darüber`);

  // Am Handy muss das Panel ohne Scrollen reichen — sonst ist der letzte Knopf
  // (Monument) unerreichbar
  await pwaPage.locator('.aliceBtn').first().click(); // Alice-Modus: mehr Kartenhöhe
  await pwaPage.locator('.aliceBtn', { hasText: '🎓' }).click(); // Lernmodus: Vorschlagszeile
  await pwaPage.locator('.panel button', { hasText: 'Monument wählen' }).click();
  await pwaPage.locator('.pick .pickCard button.primary').first().click();
  await pwaPage.locator('.picker.offer').waitFor({ timeout: 5000 });
  await pwaPage.locator('.picker.offer .offerChip').first().click();
  while (await pwaPage.locator('.bubble button.primary').count()) {
    await pwaPage.locator('.bubble button.primary').click(); // Blasen wegtippen
    await pwaPage.waitForTimeout(120);
  }
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

  // Gegenprobe: OHNE gemeldeten Inset (Browser) bleibt alles beim Alten —
  // dort wäre 100vh die Höhe ohne Leisten und damit zu groß.
  const plainPage = await pwaContext.newPage();
  await plainPage.goto(BASE_URL);
  await plainPage.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
  const plain = await plainPage.evaluate(() => ({
    cover: document.documentElement.dataset.cover !== undefined,
    htmlH: Math.round(document.documentElement.getBoundingClientRect().height),
    inner: innerHeight
  }));
  if (plain.cover) fail('Browser: data-cover gesetzt, obwohl kein Inset gemeldet wird');
  if (plain.htmlH !== plain.inner) fail(`Browser: html ${plain.htmlH} != innerHeight ${plain.inner}`);
  console.log('✓ Browser: keine Markierung, html bleibt am Viewport');
  await plainPage.close();

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
