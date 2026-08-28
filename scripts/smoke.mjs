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

  // Fläche und Symmetrie im Spiel: Das Brett muss seine Zelle wirklich nutzen,
  // und die Bretter der oberen und unteren Reihe müssen sich deckungsgleich
  // gegenüberstehen. Vorher war die Brettgröße viewport-relativ (56 % der
  // Zelle) und die Reihen standen 207 px versetzt, weil die 180°-Drehung der
  // oberen Spieler eine linksbündige Gruppe spiegelte.
  // Gemessen wird MITTEN IN DER RUNDE, mit Marke im Panel — dort ist das Panel
  // am vollsten und das Brett am kleinsten. Bei der Monumentwahl (ein Knopf)
  // sah alles gut aus, während in der Runde 82 px Bretthöhe fehlten.
  for (const [label, w, h, players, minAnteil] of [
    ['Handy Solo', 402, 874, 1, 90],
    ['Handy 4 Spieler', 402, 874, 4, 90],
    // 66 statt 70: Das Brett folgt nicht mehr dem gerade leersten Panel,
    // sondern hält die Größe, die zum vollsten Panel dieser Partie passt
    // (panelReserve). Das kostet hier ein paar Prozent — dafür springt es
    // nicht bei jedem Phasenwechsel.
    ['Tablet quer 4 Spieler', 1180, 820, 4, 66],
    ['Tablet hoch 4 Spieler', 1024, 1366, 4, 75],
    ['Handy quer 2 Spieler', 874, 402, 2, 60]
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'de-DE' });
    const gp = await ctx.newPage();
    gp.on('pageerror', (e) => fail(`Spielfläche ${label}: Seitenfehler: ${e.message}`));
    await gp.goto(BASE_URL);
    await gp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await gp.locator('.seg button', { hasText: String(players) }).first().click();
    await gp.locator('.opt.toggle input[type="checkbox"]').first().click(); // ohne Monumente
    await gp.locator('.bar button.big').click();
    await gp.locator('.picker').first().waitFor({ timeout: 5000 });
    // Material ansagen: Solo bietet drei Marken, Mehrspieler den Materialwähler
    await gp.locator('.picker .chip, .picker .offerChip').first().click();
    await gp.locator('.pendingWrap').first().waitFor({ timeout: 5000 });
    const g = await gp.evaluate(() => {
      const slot = document.querySelector('.slot').getBoundingClientRect();
      const boards = [...document.querySelectorAll('.board')].map((el) => {
        const r = el.getBoundingClientRect();
        return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), w: Math.round(r.width) };
      });
      // Nichts darf am Zellenrand abgeschnitten werden
      const clipped = [...document.querySelectorAll('.corner')].some(
        (c) => c.scrollWidth - c.clientWidth > 1 || c.scrollHeight - c.clientHeight > 1
      );
      // Punktsymmetrie um die Bildmitte: Die Sitzordnung dreht die Bretter
      // gegenüberliegender Spieler um 180°, also muss zu jedem Brett ein
      // gespiegeltes gehören. Das gilt für alle Anordnungen — Quadranten,
      // übereinander und (quer am Handy) nebeneinander.
      let versatz = 0;
      if (boards.length > 1) {
        for (const b of boards) {
          const zx = innerWidth - b.cx;
          const zy = innerHeight - b.cy;
          const best = Math.min(
            ...boards.map((o) => Math.max(Math.abs(o.cx - zx), Math.abs(o.cy - zy)))
          );
          versatz = Math.max(versatz, best);
        }
      }
      const panel = document.querySelector('.panel').getBoundingClientRect();
      return {
        anteil: Math.round((boards[0].w / Math.min(slot.width, slot.height)) * 100),
        brett: boards[0].w,
        panel: Math.round(panel.height),
        versatz,
        clipped
      };
    });
    if (g.anteil < minAnteil) {
      fail(
        `Spielfläche ${label}: Brett nutzt nur ${g.anteil}% der Zelle (${g.brett}px, Panel ${g.panel}px hoch), erwartet ≥ ${minAnteil}%`
      );
    }
    if (g.versatz > 8) fail(`Spielfläche ${label}: Reihen ${g.versatz}px versetzt`);
    if (g.clipped) fail(`Spielfläche ${label}: Inhalt wird am Zellenrand abgeschnitten`);
    await ctx.close();
  }
  console.log('✓ Spielfläche: Bretter nutzen ihre Zelle, Reihen stehen deckungsgleich, nichts abgeschnitten');

  // ---------- Gleise: liegen sie an den Brettkanten? ----------
  // Das Gleis ist EINE Linie je Brettreihe. Sind die Bretter einer Reihe
  // unterschiedlich groß, passt es zu keinem: Es lag entweder quer über beiden
  // (Mittelwert der Kanten) oder 75 px neben dem kleineren (Außenkante).
  // Gemessen wird deshalb in ZWEI Zuständen: vor dem Ansagen trägt nur der
  // Baumeister den Materialwähler — genau dann gingen die Bretter auseinander.
  for (const [label, w, h, players] of [
    ['Tablet quer 4 Spieler', 1180, 820, 4],
    ['Handy hoch 4 Spieler', 402, 874, 4],
    ['Handy quer 2 Spieler', 874, 402, 2]
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'de-DE' });
    const gp = await ctx.newPage();
    gp.on('pageerror', (e) => fail(`Gleise ${label}: Seitenfehler: ${e.message}`));
    await gp.goto(BASE_URL);
    await gp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await gp.locator('.seg button', { hasText: String(players) }).first().click();
    await gp.locator('.opt.toggle input[type="checkbox"]').first().click(); // ohne Monumente
    await gp.locator('.opt', { hasText: 'Eisenbahn' }).locator('input').click();
    await gp.locator('.bar button.big').click();
    await gp.locator('.picker').first().waitFor({ timeout: 5000 });
    const messen = async (wann) => {
      await gp.waitForTimeout(700); // Messtakt von Gleis und Panelhöhe abwarten
      const g = await gp.evaluate(() => {
        const bretter = [...document.querySelectorAll('[data-track]')].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            kante: el.dataset.trackEdge === 'top' ? 'top' : 'bottom',
            oben: r.top,
            unten: r.bottom,
            links: r.left,
            rechts: r.right
          };
        });
        const gleise = [...document.querySelectorAll('.track')].map((el) => {
          const r = el.getBoundingClientRect();
          return { y: r.top + r.height / 2, l: r.left, r: r.right };
        });
        // Nur Gleise, die waagerecht überhaupt über dem Brett liegen
        const ueber = (br) => gleise.filter((g) => g.r > br.links + 2 && g.l < br.rechts - 2);
        // 1. Bretter einer Reihe müssen gleich groß sein (gleiche Kantenhöhe)
        let spanne = 0;
        for (const kante of ['top', 'bottom']) {
          const ys = bretter
            .filter((b) => b.kante === kante)
            .map((b) => (kante === 'top' ? b.oben : b.unten));
          if (ys.length > 1) spanne = Math.max(spanne, Math.max(...ys) - Math.min(...ys));
        }
        // 2. Kein Gleis darf INNEN durch ein Brett laufen
        let schnitt = 0;
        for (const br of bretter) {
          for (const g of ueber(br)) {
            schnitt = Math.max(schnitt, Math.min(g.y - br.oben, br.unten - g.y));
          }
        }
        // 3. Jedes Brett braucht sein Gleis an der eigenen Kante
        let abstand = 0;
        for (const br of bretter) {
          const kante = br.kante === 'top' ? br.oben : br.unten;
          const nah = ueber(br).map((g) => Math.abs(g.y - kante));
          abstand = Math.max(abstand, nah.length ? Math.min(...nah) : 999);
        }
        return {
          spanne: Math.round(spanne),
          schnitt: Math.round(schnitt),
          abstand: Math.round(abstand),
          bretter: bretter.length,
          gleise: gleise.length
        };
      });
      if (g.bretter !== players) fail(`Gleise ${label} (${wann}): ${g.bretter} Bretter gemessen`);
      if (g.gleise === 0) fail(`Gleise ${label} (${wann}): keine Strecke gezeichnet`);
      if (g.spanne > 2) {
        fail(`Gleise ${label} (${wann}): Bretter einer Reihe ${g.spanne}px unterschiedlich hoch`);
      }
      if (g.schnitt > 6) fail(`Gleise ${label} (${wann}): Gleis läuft ${g.schnitt}px im Brett`);
      if (g.abstand > 6) fail(`Gleise ${label} (${wann}): Gleis liegt ${g.abstand}px neben der Kante`);
    };
    await messen('vor dem Ansagen');
    await gp.locator('.picker .chip, .picker .offerChip').first().click();
    await gp.locator('.pendingWrap').first().waitFor({ timeout: 5000 });
    await messen('mit Marke im Panel');
    await ctx.close();
  }
  console.log('✓ Gleise: an der Brettkante, in keinem Brett — auch während der Ansage');

  // Gemerkte Spielernamen: einmal tippen, beim nächsten Start wieder da — und
  // das ✕ im Feld löscht einen einzelnen Namen wieder weg.
  {
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, locale: 'de-DE' });
    const np = await ctx.newPage();
    np.on('pageerror', (e) => fail(`Namen: Seitenfehler: ${e.message}`));
    await np.goto(BASE_URL);
    await np.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });

    // Beim ersten Start sind die Felder leer, der Standardname steht als Hinweis
    const felder = np.locator('.players .nameField input');
    if ((await felder.first().inputValue()) !== '') fail('Namen: Feld beim ersten Start nicht leer');
    if ((await felder.first().getAttribute('placeholder')) !== 'Spieler 1') {
      fail('Namen: Standardname fehlt als Hinweis im leeren Feld');
    }
    await felder.nth(0).fill('Anna');
    await felder.nth(1).fill('Bert');
    await np.locator('.bar button.big').click();
    await np.locator('.board').first().waitFor({ timeout: 5000 });
    // Die Namen stehen an den Brettern
    const amBrett = await np.locator('.corner .pname').allTextContents();
    if (!amBrett.some((x) => x.includes('Anna'))) fail(`Namen: „Anna" fehlt am Brett (${amBrett})`);

    // Partie beenden und neu anfangen: die Namen sind wieder da
    await np.locator('.strip .quit').click();
    await np.locator('.scrim button', { hasText: 'Partie beenden' }).click();
    await np.locator('.bar button.big').waitFor({ timeout: 5000 });
    if ((await felder.nth(0).inputValue()) !== 'Anna') fail('Namen: nach der Partie nicht gemerkt');

    // Auch über einen Neustart der App hinweg
    await np.reload();
    await np.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    const nachReload = np.locator('.players .nameField input');
    if ((await nachReload.nth(0).inputValue()) !== 'Anna') fail('Namen: nach Reload nicht gemerkt');
    if ((await nachReload.nth(1).inputValue()) !== 'Bert') fail('Namen: zweiter Name nach Reload weg');

    // ✕ löscht genau diesen einen Namen
    await np.locator('.players .nameField').nth(0).locator('.clearName').dispatchEvent('pointerup');
    if ((await nachReload.nth(0).inputValue()) !== '') fail('Namen: ✕ löscht nicht');
    if ((await nachReload.nth(1).inputValue()) !== 'Bert') fail('Namen: ✕ löscht den falschen Namen mit');
    // Und ohne Namen greift wieder der Standard
    await np.locator('.bar button.big').click();
    await np.locator('.board').first().waitFor({ timeout: 5000 });
    const wieder = await np.locator('.corner .pname').allTextContents();
    if (!wieder.some((x) => x.includes('Spieler 1'))) {
      fail(`Namen: ohne Eingabe fehlt der Standardname (${wieder})`);
    }
    await ctx.close();
    console.log('✓ Spielernamen: gemerkt über Partie und Neustart, ✕ löscht einzeln');

  // ---------- Gemerkte Auswahl im Startbildschirm ----------
  // Wer immer zu viert mit Fortune spielt, soll das nicht jedes Mal neu
  // zusammenklicken. Ein Challenge-Link ist die Ausnahme: Er bestimmt, was
  // gespielt wird — und darf die eigenen Vorgaben nicht überschreiben.
  {
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, locale: 'de-DE' });
    const sp = await ctx.newPage();
    sp.on('pageerror', (e) => fail(`Auswahl merken: Seitenfehler: ${e.message}`));
    const heute = new Date();
    const tag = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-${String(heute.getDate()).padStart(2, '0')}`;
    const start = async (url = BASE_URL) => {
      await sp.goto(url);
      await sp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
      const neu = sp.locator('button', { hasText: 'Neues Spiel' });
      if (await neu.count()) await neu.click();
      await sp.locator('.bar button.big').waitFor({ timeout: 5000 });
    };
    const aktiv = () =>
      sp.evaluate(() =>
        [...document.querySelectorAll('.seg button.primary')].map((b) => b.textContent.trim())
      );
    const gemerkt = () => sp.evaluate(() => localStorage.getItem('tinytowns.setup.v1'));

    // Auswahl treffen und eine Partie starten — erst dann ist sie echt
    await start();
    await sp.locator('.seg button', { hasText: '2' }).first().click();
    await sp.locator('.opt', { hasText: 'Fortune' }).locator('input').check();
    await sp.locator('.bar button.big').click();
    await sp.locator('.board').first().waitFor({ timeout: 8000 });

    // Frisch geladen muss beides wieder dastehen
    await start();
    const nachher = await aktiv();
    if (!nachher.includes('2')) fail(`Auswahl merken: Spielerzahl nicht gemerkt (${nachher})`);
    const fortune = await sp.locator('.opt', { hasText: 'Fortune' }).locator('input').isChecked();
    if (!fortune) fail('Auswahl merken: Erweiterung nicht gemerkt');

    // Challenge-Link: gewinnt für diesen Besuch, ändert aber nichts an den Vorgaben
    const vorLink = await gemerkt();
    await start(`${BASE_URL}#daily=${tag}`);
    const imLink = await aktiv();
    if (!imLink.includes('1') || !imLink.some((x) => x.includes('Tages-Challenge'))) {
      fail(`Auswahl merken: Link setzt sich nicht durch (${imLink})`);
    }
    await sp.locator('.bar button.big').click();
    await sp.locator('.board').first().waitFor({ timeout: 8000 });
    if ((await gemerkt()) !== vorLink) {
      fail('Auswahl merken: eine Partie aus dem Link hat die eigenen Vorgaben überschrieben');
    }

    // …und danach steht die eigene Auswahl unverändert da
    await start();
    const zurueck = await aktiv();
    if (!zurueck.includes('2')) fail(`Auswahl merken: nach dem Link verloren (${zurueck})`);
    console.log('✓ Startbildschirm merkt Spielerzahl und Variante — außer beim Challenge-Link');
    await ctx.close();
  }
  }

  // Trefflächen: Jedes Bedienelement muss mindestens 44×44 groß sein — als
  // Element oder, bei Textlinks, über die vergrößerte Trefffläche (.tapArea).
  // Ausgenommen sind NAMENTLICH die dichten Raster, die von Natur aus anders
  // funktionieren: Karten der Auslage und Brettfelder (letztere sind ohnehin
  // keine <button>). Keine Ausnahme wegen „ist eben klein".
  {
    const TAP = 44;
    const EXEMPT = ['mini', 'cardBtn', 'chip', 'square'];
    const probe = async (pg, wo) => {
      const bad = await pg.evaluate(({ TAP, EXEMPT }) => {
        const out = [];
        for (const el of document.querySelectorAll('button, select')) {
          if (el.offsetParent === null) continue;
          const cls = [...el.classList];
          if (cls.some((c) => EXEMPT.includes(c))) continue;
          if (el.closest('.cards, .board')) continue;
          const r = el.getBoundingClientRect();
          // .tapArea vergrößert nur die Trefffläche — dann zählt das ::after
          // (inset: -16px in app.css, also 32 px in jeder Achse)
          const grow = cls.includes('tapArea') ? 32 : 0;
          const w = r.width + grow;
          const h = r.height + grow;
          if (w + 0.5 < TAP || h + 0.5 < TAP) {
            out.push(`${cls.join('.') || el.tagName}(${(el.textContent || '').trim().slice(0, 14)}) ${Math.round(w)}×${Math.round(h)}`);
          }
        }
        return out;
      }, { TAP, EXEMPT });
      if (bad.length) fail(`Trefflächen ${wo}: zu klein — ${bad.join(', ')}`);
    };

    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, locale: 'de-DE' });
    const tp = await ctx.newPage();
    tp.on('pageerror', (e) => fail(`Trefflächen: Seitenfehler: ${e.message}`));
    await tp.goto(BASE_URL);
    await tp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await probe(tp, 'Startbildschirm');
    await tp.locator('.seg button', { hasText: 'Mit eigenen' }).click();
    await probe(tp, 'Startbildschirm (eigene Geräte)');
    await tp.locator('button', { hasText: 'Partie beitreten' }).click();
    await probe(tp, 'Beitritt');
    // Der Beitritt ist ein Zustand, keine Navigation — zurück per Neuladen
    await tp.reload();
    await tp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await tp.locator('.seg button', { hasText: '1' }).first().click();
    await tp.locator('.bar button.big').click();
    await tp.locator('.board').waitFor({ timeout: 5000 });
    await probe(tp, 'Spiel (Solo)');
    await ctx.close();
    console.log('✓ Trefflächen: alle Bedienelemente mindestens 44×44');
  }

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

  // Thema und Sprache gehören auf beiden Einstiegs-Screens in die obere Leiste
  // am Bildschirmrand — nicht in die Bildmitte, wo sie mit dem zentrierten
  // Inhalt wanderten.
  for (const [label, open] of [
    ['Startbildschirm', async (pg) => pg],
    ['Beitritt', async (pg) => { await pg.locator('button', { hasText: 'Partie beitreten' }).click(); return pg; }]
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, locale: 'de-DE' });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => fail(`${label}: Seitenfehler: ${e.message}`));
    await pg.goto(BASE_URL);
    await pg.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await open(pg);
    await pg.locator('.langRow').waitFor({ timeout: 5000 });
    const head = await pg.evaluate(() => {
      const row = document.querySelector('.langRow').getBoundingClientRect();
      const last = document.querySelector('.langRow > *:last-child').getBoundingClientRect();
      return { top: Math.round(row.top), right: Math.round(innerWidth - last.right) };
    });
    if (head.top > 40) fail(`${label}: Kopfzeile sitzt nicht oben (y=${head.top})`);
    if (head.right > 40) fail(`${label}: Kopfzeile nicht am rechten Rand (${head.right}px Abstand)`);
    await ctx.close();
  }
  console.log('✓ Thema und Sprache sitzen auf beiden Einstiegs-Screens oben rechts');

  // Ergebnis teilen: Der Knopf muss den Teilen-Dialog mit Rang, Punkten und
  // einem Link auf GENAU diesen Tag füttern — und der Link muss beim Empfänger
  // dieselbe Tages-Challenge vorwählen.
  {
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, locale: 'de-DE' });
    const sp = await ctx.newPage();
    sp.on('pageerror', (e) => fail(`Teilen: Seitenfehler: ${e.message}`));
    // navigator.share gibt es im Testbrowser nicht — einsetzen und mitschneiden
    await sp.addInitScript(() => {
      window.__shared = null;
      navigator.canShare = (d) => !!d.files;
      navigator.share = (d) => {
        window.__shared = {
          text: d.text,
          files: (d.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size }))
        };
        return Promise.resolve();
      };
    });
    await sp.goto(BASE_URL);
    await sp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await sp.locator('.seg button', { hasText: '1' }).first().click();
    await sp.locator('.seg button', { hasText: 'Tages-Challenge' }).click();
    await sp.locator('.bar button.big').click();
    // Solo bis zum Ende durchspielen wäre lang — die Wertung direkt aufrufen
    await sp.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('tinytowns.save.v1'));
      st.phase = { t: 'gameOver' };
      localStorage.setItem('tinytowns.save.v1', JSON.stringify(st));
    });
    await sp.reload();
    await sp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await sp.locator('button', { hasText: 'Weiterspielen' }).click();
    const shareBtn = sp.locator('button', { hasText: 'Ergebnis teilen' });
    await shareBtn.waitFor({ timeout: 5000 });
    await shareBtn.dispatchEvent('pointerup');
    await sp.waitForFunction(() => window.__shared !== null, { timeout: 8000 })
      .catch(() => fail('Teilen: navigator.share wurde nicht aufgerufen'));
    const shared = await sp.evaluate(() => window.__shared);
    // Der Text-Knopf teilt NUR Text. Das ist keine Sparsamkeit: iOS wirft beim
    // Teilen mit Datei den Text weg — wer den Text will, muss ihn ohne Bild
    // bekommen können.
    if (shared.files.length > 0) fail('Teilen: Text-Knopf hängt ein Bild an (iOS verliert dann den Text)');
    const today = await sp.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    if (!shared.text.includes(today)) fail(`Teilen: Datum fehlt im Text (${shared.text})`);
    if (!shared.text.includes('Punkte')) fail(`Teilen: Punkte fehlen (${shared.text})`);
    if (!shared.text.includes(`#daily=${today}`)) fail(`Teilen: Link fehlt (${shared.text})`);
    if (/[🟩🟫🟥⬜]/u.test(shared.text)) fail('Teilen: Text verrät das Brett-Layout');
    console.log('✓ Ergebnis teilen: Rang, Punkte und Tages-Link im Teilen-Dialog');

    // Bild: Wo der Browser Dateien teilen kann, gibt es dafür einen eigenen
    // Knopf — und der muss ein PNG samt Text mitgeben.
    await sp.evaluate(() => (window.__shared = null));
    const imgBtn = sp.locator('button', { hasText: 'Als Bild teilen' });
    if ((await imgBtn.count()) === 0) fail('Teilen: kein Knopf „Als Bild teilen"');
    await imgBtn.dispatchEvent('pointerup');
    // Das Bild entsteht asynchron (Canvas → PNG), also auf den Aufruf warten
    await sp.waitForFunction(() => window.__shared !== null, { timeout: 8000 })
      .catch(() => fail('Teilen: Bild-Knopf hat nicht geteilt'));
    const withImg = await sp.evaluate(() => window.__shared);
    const img = withImg.files?.[0];
    if (!img) fail('Teilen: kein Bild im Teilen-Dialog');
    if (img.type !== 'image/png') fail(`Teilen: Bild ist kein PNG (${img.type})`);
    if (img.size < 5000) fail(`Teilen: Bild verdächtig klein (${img.size} Bytes)`);
    if (!withImg.text?.includes(today)) fail('Teilen: Bild-Weg ohne Text');
    console.log(`✓ Ergebnis teilen: Text ohne Bild, Bild auf eigenem Knopf (${Math.round(img.size / 1024)} KB PNG)`);

    // Ohne Datei-Unterstützung darf nichts abbrechen — dann nur Text.
    const tp = await ctx.newPage();
    await tp.addInitScript(() => {
      window.__shared = null;
      navigator.canShare = () => false;
      navigator.share = (d) => {
        window.__shared = { text: d.text, files: (d.files ?? []).length };
        return Promise.resolve();
      };
    });
    await tp.goto(BASE_URL);
    await tp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await tp.locator('button', { hasText: 'Weiterspielen' }).click();
    // Wo keine Datei geteilt werden kann, darf der Bild-Knopf gar nicht stehen
    if (await tp.locator('button', { hasText: 'Als Bild teilen' }).count()) {
      fail('Teilen: Bild-Knopf trotz fehlender Datei-Unterstützung');
    }
    await tp.locator('button', { hasText: 'Ergebnis teilen' }).dispatchEvent('pointerup');
    await tp.waitForFunction(() => window.__shared !== null, { timeout: 8000 });
    const textOnly = await tp.evaluate(() => window.__shared);
    if (textOnly.files !== 0) fail('Teilen: Bild trotz fehlender Datei-Unterstützung');
    if (!textOnly.text.includes(today)) fail('Teilen: Text-Rückfall unvollständig');
    console.log('✓ Ohne Datei-Unterstützung: kein Bild-Knopf, Text-Rückfall steht');
    await tp.close();

    // Empfängerseite: Der Link wählt Solo + genau diesen Tag vor
    const link = shared.text.split('\n').pop().trim();
    const rp = await ctx.newPage();
    rp.on('pageerror', (e) => fail(`Geteilter Link: Seitenfehler: ${e.message}`));
    await rp.goto(link);
    await rp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    // Bei laufendem Spielstand kommt erst der Weiterspielen-Bildschirm; die
    // Vorauswahl greift, sobald der Startbildschirm erscheint.
    const fresh = rp.locator('button', { hasText: 'Neues Spiel' });
    if (await fresh.count()) await fresh.click();
    await rp.locator('.bar button.big').waitFor({ timeout: 5000 });
    const picked = await rp.evaluate(() => {
      const on = [...document.querySelectorAll('.seg button.primary')].map((b) => b.textContent.trim());
      return on;
    });
    if (!picked.includes('1')) fail(`Geteilter Link: Solo nicht vorgewählt (${picked})`);
    if (!picked.some((p) => p.includes('Tages-Challenge'))) {
      fail(`Geteilter Link: Tages-Challenge nicht vorgewählt (${picked})`);
    }
    console.log('✓ Geteilter Link wählt Solo und die Tages-Challenge vor');

    // …und gilt nur für DIESEN Besuch: Der Parameter verschwindet danach aus
    // der Adresse. Blieb er stehen, wählte jeder Reload wieder still denselben
    // Tag vor — jede „neue" Partie hatte dieselbe Auslage, in der Landpartie
    // sichtbar als immer dieselbe Landschaft.
    if (/daily=/.test(await rp.evaluate(() => location.hash))) {
      fail('Geteilter Link: daily bleibt in der Adresse und heftet jede Partie an den Tag');
    }
    // Der Reload-Beweis braucht ein FRISCHES Gerät: Seit der Startbildschirm die
    // letzte Auswahl merkt, wäre „Tages-Challenge nach dem Reload" auch dann
    // richtig, wenn man sie zuvor von Hand gewählt hat. Ohne gemerkte Vorgaben
    // kann nur eine Ursache übrig bleiben — ein Link, der in der Adresse klebt.
    const jungfräulich = await browser.newContext({
      viewport: { width: 402, height: 874 },
      locale: 'de-DE'
    });
    const np = await jungfräulich.newPage();
    np.on('pageerror', (e) => fail(`Geteilter Link (frisches Gerät): Seitenfehler: ${e.message}`));
    await np.goto(link);
    await np.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await np.locator('.bar button.big').waitFor({ timeout: 5000 });
    await np.reload();
    await np.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await np.locator('.bar button.big').waitFor({ timeout: 5000 });
    const nachReload = await np.evaluate(() =>
      [...document.querySelectorAll('.seg button.primary')].map((b) => b.textContent.trim())
    );
    if (nachReload.some((p) => p.includes('Tages-Challenge'))) {
      fail(`Geteilter Link: nach dem Reload immer noch Tages-Challenge (${nachReload})`);
    }
    await jungfräulich.close();
    console.log('✓ Nach dem Reload ist die Adresse frei — neue Partien würfeln wieder');
    await ctx.close();
  }

  // ---------- Freie Landpartie würfelt jedes Mal neu ----------
  // Genau hier fiel es auf: In der Landpartie ist die Landschaft das Gesicht
  // der Partie. Ist sie zweimal gleich, ist etwas mit dem Seed faul.
  {
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, locale: 'de-DE' });
    const lp = await ctx.newPage();
    lp.on('pageerror', (e) => fail(`Freie Landpartie: Seitenfehler: ${e.message}`));
    const layouts = new Set();
    for (let runde = 0; runde < 3; runde++) {
      await lp.goto(BASE_URL);
      await lp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
      const neu = lp.locator('button', { hasText: 'Neues Spiel' });
      if (await neu.count()) await neu.click();
      await lp.locator('.seg button', { hasText: '1' }).first().click();
      await lp.locator('.landOpt input').check();
      await lp.locator('.bar button.big').click();
      await lp.locator('.board').first().waitFor({ timeout: 8000 });
      await lp.waitForTimeout(200);
      const cfg = await lp.evaluate(
        () => JSON.parse(localStorage.getItem('tinytowns.save.v1')).config
      );
      if (cfg.dailyId) fail(`Freie Landpartie: hat einen dailyId (${cfg.dailyId})`);
      if (!cfg.terrain?.length) fail('Freie Landpartie: keine Landschaft im Spielstand');
      layouts.add(JSON.stringify(cfg.terrain));
    }
    if (layouts.size < 3) {
      fail(`Freie Landpartie: nur ${layouts.size} verschiedene Landschaften in 3 Partien`);
    }
    console.log('✓ Freie Landpartie: drei Partien, drei verschiedene Landschaften');
    await ctx.close();
  }

  // ---------- Endwertung: passt sie ins Bild? ----------
  // Die Wertungstabelle stand in einer 420er-Spalte, egal wie groß der Schirm
  // war: Bei vier Spielern war sie 475 px breit und musste seitlich gescrollt
  // werden, während auf dem Tablet links und rechts 300 px leer blieben.
  for (const [label, w, h, players] of [
    ['Tablet quer', 1180, 820, 4],
    ['Tablet hoch', 1024, 1366, 4],
    ['Handy', 402, 874, 4]
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'de-DE' });
    const wp = await ctx.newPage();
    wp.on('pageerror', (e) => fail(`Endwertung ${label}: Seitenfehler: ${e.message}`));
    await wp.goto(BASE_URL);
    await wp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await wp.locator('.seg button', { hasText: String(players) }).first().click();
    await wp.locator('.opt', { hasText: 'Fortune' }).locator('input').click();
    await wp.locator('.bar button.big').click();
    await wp.waitForTimeout(300);
    // Durchspielen wäre lang: Wertung direkt aufrufen, Bretter voll bauen —
    // erst dann hat die Tabelle so viele Zeilen und Namen wie in echt.
    await wp.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('tinytowns.save.v1'));
      st.phase = { t: 'gameOver' };
      const karten = st.config.activeCards;
      for (const p of st.players) {
        p.board = p.board.map((_, i) => ({ building: { card: karten[i % karten.length] } }));
      }
      localStorage.setItem('tinytowns.save.v1', JSON.stringify(st));
    });
    await wp.reload();
    await wp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await wp.locator('button', { hasText: 'Weiterspielen' }).click();
    await wp.locator('.tableWrap').waitFor({ timeout: 5000 });
    await wp.waitForTimeout(200);
    const g = await wp.evaluate(() => {
      const tw = document.querySelector('.tableWrap');
      const main = document.querySelector('main');
      const breit = (sel) => {
        const el = document.querySelector(sel);
        return el ? Math.round(el.getBoundingClientRect().width) : null;
      };
      return {
        quer: tw.scrollWidth - tw.clientWidth,
        hoch: main.scrollHeight - main.clientHeight,
        tabelle: breit('.tableWrap'),
        knoepfe: breit('.actions')
      };
    });
    if (g.quer > 1) fail(`Endwertung ${label}: Tabelle muss ${g.quer}px seitlich gescrollt werden`);
    if (g.hoch > 1) fail(`Endwertung ${label}: Wertung passt ${g.hoch}px nicht in die Höhe`);
    // Flächen untereinander gleich breit — sonst steht die Wertung als Treppe
    if (Math.abs(g.tabelle - g.knoepfe) > 1) {
      fail(`Endwertung ${label}: Tabelle ${g.tabelle}px, Knopfzeile ${g.knoepfe}px`);
    }
    await ctx.close();
  }
  console.log('✓ Endwertung: nichts zu scrollen, Flächen gleich breit (Handy und Tablet)');

  // ---------- Tageswahl der Challenge ----------
  // In der installierten App gibt es keinen Link zum Antippen: iOS übergibt
  // Web-Links nie an eine Homescreen-App. Wer eine geteilte Challenge von
  // gestern spielen will, braucht die Tageswahl — sonst käme er nur über den
  // Browser hin, mit getrennter Bestenliste.
  {
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, locale: 'de-DE' });
    const dp = await ctx.newPage();
    dp.on('pageerror', (e) => fail(`Tageswahl: Seitenfehler: ${e.message}`));
    await dp.goto(BASE_URL);
    await dp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await dp.locator('.seg button', { hasText: '1' }).first().click();
    await dp.locator('.seg button', { hasText: 'Tages-Challenge' }).click();
    const pick = dp.locator('.dayPick');
    await pick.waitFor({ timeout: 5000 });
    const zurueck = pick.locator('button').first();
    const vor = pick.locator('button').last();
    const tag = () => pick.locator('.dayLabel').innerText();
    const heute = await dp.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    if (!(await tag()).includes(heute)) fail(`Tageswahl: startet nicht bei heute (${await tag()})`);
    if (!(await tag()).includes('heute')) fail('Tageswahl: heute ist nicht als heute gekennzeichnet');
    // Die Zukunft bleibt zu — sonst wäre die Auslage von morgen vorab bekannt
    if (!(await vor.isDisabled())) fail('Tageswahl: die Zukunft ist wählbar');
    await zurueck.dispatchEvent('pointerup');
    const gestern = await tag();
    if (gestern.includes(heute)) fail('Tageswahl: ‹ hat den Tag nicht geändert');
    if (await vor.isDisabled()) fail('Tageswahl: von gestern führt kein Weg zurück nach heute');
    // Bis ans Ende der Historie blättern: dann ist ‹ zu
    for (let i = 0; i < 13; i++) await zurueck.dispatchEvent('pointerup');
    if (!(await zurueck.isDisabled())) fail('Tageswahl: blättert über die Historie hinaus');
    // Und der gewählte Tag muss auch in der Partie ankommen
    await vor.dispatchEvent('pointerup');
    const gewaehlt = (await tag()).replace(/[^0-9-]/g, '');
    await dp.locator('.bar button.big').click();
    await dp.locator('.corner').first().waitFor({ timeout: 5000 });
    const gespielt = await dp.evaluate(
      () => JSON.parse(localStorage.getItem('tinytowns.save.v1')).config.dailyId
    );
    if (gespielt !== gewaehlt) fail(`Tageswahl: gespielt wird ${gespielt}, gewählt war ${gewaehlt}`);
    console.log(`✓ Tageswahl: heute bis ${gewaehlt}, Zukunft gesperrt, gewählter Tag wird gespielt`);
    await ctx.close();
  }

  // ---------- Landpartie: 5×6, Landschaft, Anlieger-Karten ----------
  // Der Modus lebt von zwei Zusagen: Landschaft ist NIE bespielbar, und die
  // Tages-Challenge erzeugt aus dem Datum weltweit dieselbe Karte.
  {
    const starte = async (pg) => {
      await pg.goto(BASE_URL);
      await pg.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
      await pg.locator('.seg button', { hasText: '1' }).first().click();
      await pg.locator('.seg button', { hasText: 'Tages-Challenge' }).click();
      await pg.locator('.landOpt input').click();
      await pg.locator('.bar button.big').click();
      await pg.locator('.corner').waitFor({ timeout: 5000 });
      // Monumente sind in der Challenge fest an (sonst wäre der Tag nicht
      // weltweit dieselbe Partie), also erst den Draft durchklicken.
      await pg.locator('button', { hasText: 'Monument wählen' }).first().click();
      await pg.locator('.pickCard button.primary').first().click();
      await pg.waitForTimeout(400);
      return pg.evaluate(() => {
        const st = JSON.parse(localStorage.getItem('tinytowns.save.v1'));
        return {
          zellen: document.querySelectorAll('.cell').length,
          terrainZellen: document.querySelectorAll('.terrainCell').length,
          terrainButtons: document.querySelectorAll('.terrainCell[role="button"]').length,
          terrain: st.config.terrain,
          karten: st.config.activeCards,
          land: st.config.land
        };
      });
    };
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: 'de-DE' });
    const lp = await ctx.newPage();
    lp.on('pageerror', (e) => fail(`Landpartie: Seitenfehler: ${e.message}`));
    const a = await starte(lp);
    if (!a.land) fail('Landpartie: Modus kam nicht im Spielstand an');
    if (a.zellen !== 30) fail(`Landpartie: ${a.zellen} Zellen statt 30`);
    if (a.terrainZellen < 9 || a.terrainZellen > 13) {
      fail(`Landpartie: ${a.terrainZellen} Landschaftsfelder (erwartet 9–13)`);
    }
    if (a.terrainButtons !== 0) fail('Landpartie: Landschaft ist als Trefffläche markiert');
    if (a.karten.length !== 10) fail(`Landpartie: ${a.karten.length} Karten statt 10`);

    // Material auf Landschaft tippen bewirkt nichts, auf freiem Feld liegt es
    await lp.locator('.picker .chip, .picker .offerChip').first().click();
    await lp.locator('.pendingWrap').first().waitFor({ timeout: 5000 });
    const tSquare = a.terrain[0].square;
    const frei = await lp.evaluate((t) => {
      const st = JSON.parse(localStorage.getItem('tinytowns.save.v1'));
      for (let i = 0; i < 30; i++) {
        if (!st.config.terrain.some((c) => c.square === i)) return i;
      }
      return -1;
    }, tSquare);
    // Terrainzelle hat kein data-square — es darf schlicht kein Ziel geben
    if (await lp.locator(`[data-square="${tSquare}"]`).count()) {
      fail('Landpartie: Landschaftsfeld ist als data-square-Ziel erreichbar');
    }
    await lp.locator(`[data-square="${frei}"]`).click();
    const gelegt = await lp.evaluate(
      (i) => JSON.parse(localStorage.getItem('tinytowns.save.v1')).players[0].board[i].resource,
      frei
    );
    if (!gelegt) fail('Landpartie: Material liegt nicht auf dem freien Feld');

    // Tages-Determinismus: frischer Kontext, gleiches Datum → gleiche Karte
    const ctx2 = await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: 'de-DE' });
    const lp2 = await ctx2.newPage();
    const b = await starte(lp2);
    if (JSON.stringify(a.terrain) !== JSON.stringify(b.terrain)) {
      fail('Landpartie: gleiche Tages-Challenge, verschiedene Landschaft');
    }
    if (JSON.stringify(a.karten) !== JSON.stringify(b.karten)) {
      fail('Landpartie: gleiche Tages-Challenge, verschiedene Auslage');
    }
    await ctx2.close();
    await ctx.close();
    console.log('✓ Landpartie: 30 Felder (5×6), Landschaft gesperrt, 10 Karten, Tageskarte deterministisch');

    // Mehrspieler: Alle bekommen DIESELBE Landschaft. Verschiedene Landschaften
    // wären verschiedene Spiele — die Städte ließen sich nicht vergleichen.
    for (const [label, w, h, players] of [
      ['Tablet quer', 1180, 820, 4],
      ['Handy hoch', 402, 874, 2]
    ]) {
      const mctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'de-DE' });
      const mp = await mctx.newPage();
      mp.on('pageerror', (e) => fail(`Landpartie ${label} ${players}P: Seitenfehler: ${e.message}`));
      await mp.goto(BASE_URL);
      await mp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
      const neu = mp.locator('button', { hasText: 'Neues Spiel' });
      if (await neu.count()) await neu.click();
      await mp.locator('.seg button', { hasText: String(players) }).first().click();
      const schalter = mp.locator('.landOpt input');
      if ((await schalter.count()) === 0) {
        fail(`Landpartie ${label} ${players}P: kein Schalter bei ${players} Spielern`);
      }
      await schalter.check();
      await mp.locator('.bar button.big').click();
      await mp.locator('.board').first().waitFor({ timeout: 8000 });
      await mp.waitForTimeout(400);
      const g = await mp.evaluate(() => {
        const st = JSON.parse(localStorage.getItem('tinytowns.save.v1'));
        const fingerprint = st.players.map((p) => p.board.map((sq) => sq.terrain ?? '-').join(''));
        const bretter = [...document.querySelectorAll('.board')].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
        return {
          spieler: st.players.length,
          land: st.config.land === true,
          felder: st.players[0].board.length,
          landschaft: st.players[0].board.filter((sq) => sq.terrain).length,
          verschiedene: new Set(fingerprint).size,
          karten: st.config.activeCards.length,
          erweiterungen: st.config.sets,
          systeme: st.config.systems,
          bretter,
          clipped: [...document.querySelectorAll('.corner')].some(
            (c) => c.scrollWidth - c.clientWidth > 1 || c.scrollHeight - c.clientHeight > 1
          )
        };
      });
      const wo = `Landpartie ${label} ${players}P`;
      if (!g.land || g.felder !== 30) fail(`${wo}: ${g.felder} Felder, land=${g.land}`);
      if (g.landschaft < 9 || g.landschaft > 13) fail(`${wo}: ${g.landschaft} Landschaftsfelder`);
      if (g.verschiedene !== 1) fail(`${wo}: ${g.verschiedene} verschiedene Landschaften`);
      if (g.bretter.length !== players) fail(`${wo}: ${g.bretter.length} Bretter statt ${players}`);
      // Gleich große Bretter, und die Form stimmt (5:6, also höher als breit)
      for (const b of g.bretter) {
        if (b.w !== g.bretter[0].w || b.h !== g.bretter[0].h) {
          fail(`${wo}: Bretter unterschiedlich groß (${JSON.stringify(g.bretter)})`);
        }
        if (Math.abs(b.h / b.w - 6 / 5) > 0.05) fail(`${wo}: Brettform ${b.w}×${b.h} ist nicht 5:6`);
      }
      if (g.clipped) fail(`${wo}: Inhalt wird am Zellenrand abgeschnitten`);
      // Ohne angehaktes Zusatzhäkchen bleibt es pur: 7 + 3 Anlieger, sonst nichts.
      // (Erweiterungen SIND hier wählbar — das prüft der Block darunter.)
      if (g.karten !== 10) fail(`${wo}: ${g.karten} Karten statt 10`);
      if (JSON.stringify(g.erweiterungen) !== JSON.stringify(['base'])) {
        fail(`${wo}: Erweiterungen aktiv, obwohl nichts angehakt war (${g.erweiterungen})`);
      }
      for (const [name, an] of Object.entries(g.systeme)) {
        if (an) fail(`${wo}: System „${name}" ist an, obwohl nichts angehakt war`);
      }
      await mctx.close();
    }
    console.log('✓ Landpartie: Standard bleibt pur, dieselbe Landschaft für alle, gleich große Bretter');

    // Die Landpartie ist nur ein anderes Brett: Erweiterungen, Rathaus,
    // Eisenbahn und Höhle gelten dort genauso. Geprüft wird, dass die Häkchen
    // wirklich in der Partie ankommen — und dass der Bahnhof baubar bleibt:
    // Die Landschaft darf die unterste Reihe (die Strecke) nicht zulegen.
    {
      const kctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: 'de-DE' });
      const kp = await kctx.newPage();
      kp.on('pageerror', (e) => fail(`Landpartie+Erweiterungen: Seitenfehler: ${e.message}`));
      await kp.goto(BASE_URL);
      await kp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
      const neu3 = kp.locator('button', { hasText: 'Neues Spiel' });
      if (await neu3.count()) await neu3.click();
      await kp.locator('.seg button', { hasText: '2' }).first().click();
      await kp.locator('.landOpt input').check();
      // Alle Schalter müssen bei aktiver Landpartie noch da sein
      for (const name of ['Rathaus-Modus', 'Eisenbahn-Modus', 'Höhlen-Regel', 'Fortune']) {
        const opt = kp.locator('.opt', { hasText: name });
        if ((await opt.count()) === 0) fail(`Landpartie+Erweiterungen: „${name}" fehlt im Setup`);
        await opt.locator('input').first().check();
      }
      await kp.locator('.bar button.big').click();
      await kp.locator('.board').first().waitFor({ timeout: 8000 });
      await kp.waitForTimeout(700); // Messtakt der Gleise abwarten
      const k = await kp.evaluate(() => {
        const st = JSON.parse(localStorage.getItem('tinytowns.save.v1'));
        const bretter = [...document.querySelectorAll('[data-track]')].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            kante: el.dataset.trackEdge === 'top' ? 'top' : 'bottom',
            oben: r.top, unten: r.bottom, links: r.left, rechts: r.right
          };
        });
        const gleise = [...document.querySelectorAll('.track')].map((el) => {
          const r = el.getBoundingClientRect();
          return { y: r.top + r.height / 2, l: r.left, r: r.right };
        });
        let schnitt = 0;
        for (const br of bretter) {
          for (const g of gleise.filter((g) => g.r > br.links + 2 && g.l < br.rechts - 2)) {
            schnitt = Math.max(schnitt, Math.min(g.y - br.oben, br.unten - g.y));
          }
        }
        return {
          felder: st.players[0].board.length,
          land: st.config.land === true,
          karten: st.config.activeCards.length,
          bahnhof: st.config.activeCards.includes('train_station'),
          sets: st.config.sets,
          systeme: st.config.systems,
          rathaus: st.config.townHall === true,
          landschaft: st.players[0].board.map((sq) => !!sq.terrain),
          gleise: gleise.length,
          schnitt: Math.round(schnitt)
        };
      });
      const wo2 = 'Landpartie+Erweiterungen';
      if (!k.land || k.felder !== 30) fail(`${wo2}: ${k.felder} Felder, land=${k.land}`);
      // 7 Kategorien + Bahnhof + 3 Anlieger
      if (k.karten !== 11) fail(`${wo2}: ${k.karten} Karten statt 11`);
      if (!k.bahnhof) fail(`${wo2}: der Bahnhof liegt nicht aus`);
      if (!k.sets.includes('fortune')) fail(`${wo2}: Fortune kam nicht in der Partie an`);
      if (!k.systeme.coins) fail(`${wo2}: Münzen sind aus`);
      if (!k.systeme.train) fail(`${wo2}: die Eisenbahn ist aus`);
      if (!k.systeme.cavern) fail(`${wo2}: die Höhlen-Regel ist aus`);
      if (!k.rathaus) fail(`${wo2}: das Rathaus ist aus`);
      if (k.gleise === 0) fail(`${wo2}: keine Strecke gezeichnet`);
      if (k.schnitt > 6) fail(`${wo2}: Gleis läuft ${k.schnitt}px im Brett`);
      // Bahnhof (Muster 1×3, drehbar) braucht Platz in der untersten Reihe
      const frei = (row, col) => !k.landschaft[row * 5 + col];
      let platz = false;
      for (let c = 0; c + 3 <= 5; c++) if (frei(5, c) && frei(5, c + 1) && frei(5, c + 2)) platz = true;
      for (let c = 0; c < 5; c++) if (frei(5, c) && frei(4, c) && frei(3, c)) platz = true;
      if (!platz) fail(`${wo2}: die Landschaft lässt keinen Platz für den Bahnhof an der Strecke`);
      await kctx.close();
      console.log('✓ Landpartie mit Erweiterungen, Rathaus, Höhle und Eisenbahn — Bahnhof baubar');
    }

    // Grenze am Handy: Zu drei oder vier an EINEM Telefon wäre das 5×6-Brett
    // unbedienbar (gemessen 23 px je Feld). Der Schalter verschwindet dort —
    // aber nicht stillschweigend, sondern mit Begründung. Mit eigenen Geräten
    // und auf dem Tablet gilt die Grenze nicht.
    for (const [label, w, h, players, multi, erwartet] of [
      ['Handy hoch', 402, 874, 4, false, 'gesperrt'],
      ['Handy hoch', 402, 874, 3, false, 'gesperrt'],
      ['Handy quer', 874, 402, 4, false, 'gesperrt'],
      ['Handy hoch', 402, 874, 2, false, 'offen'],
      ['Handy hoch', 402, 874, 4, true, 'offen'],
      ['Tablet quer', 1180, 820, 4, false, 'offen'],
      ['Tablet hoch', 1024, 1366, 4, false, 'offen']
    ]) {
      const gctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'de-DE' });
      const gp = await gctx.newPage();
      gp.on('pageerror', (e) => fail(`Landpartie-Grenze: Seitenfehler: ${e.message}`));
      await gp.goto(BASE_URL);
      await gp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
      const neu2 = gp.locator('button', { hasText: 'Neues Spiel' });
      if (await neu2.count()) await neu2.click();
      await gp.locator('.seg button', { hasText: String(players) }).first().click();
      if (multi) await gp.locator('.seg button', { hasText: 'Mit eigenen' }).click();
      await gp.waitForTimeout(150);
      const schalterDa = (await gp.locator('.landOpt input').count()) > 0;
      const hinweisDa = (await gp.locator('.landHint').count()) > 0;
      const wo = `Landpartie-Grenze ${label} ${players}P ${multi ? 'eigene Geräte' : 'ein Gerät'}`;
      if (erwartet === 'gesperrt') {
        if (schalterDa) fail(`${wo}: Schalter steht trotzdem da`);
        if (!hinweisDa) fail(`${wo}: gesperrt, aber ohne Begründung`);
      } else {
        if (!schalterDa) fail(`${wo}: Schalter fehlt, obwohl erlaubt`);
        if (hinweisDa) fail(`${wo}: Begründung steht da, obwohl erlaubt`);
      }
      await gctx.close();
    }
    console.log('✓ Landpartie-Grenze: am Handy zu 3–4 nur mit eigenen Geräten, mit Begründung');
  }

  // Tages-Challenge spielt pur: Ein Datum muss weltweit dieselbe Partie sein.
  // Geprüft wird der gefährliche Weg — gemerkte Häkchen aus einer früheren
  // Runde. Die dürfen nicht durchschlagen, auch nicht die Monumente (ohne sie
  // zieht der Monument-Stapel nicht und das Material-Deck verschiebt sich).
  {
    const vorlieben = {
      count: 1, multiDevice: false, soloMode: 'daily', land: false,
      useMonuments: false, sets: ['fortune', 'tiny_trees'],
      townHall: true, train: true, cavern: true
    };
    const starte = async (modus) => {
      const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, locale: 'de-DE' });
      const dp = await ctx.newPage();
      dp.on('pageerror', (e) => fail(`Challenge pur: Seitenfehler: ${e.message}`));
      await dp.addInitScript((v) => {
        localStorage.setItem('tinytowns.setup.v1', JSON.stringify(v));
      }, { ...vorlieben, soloMode: modus });
      await dp.goto(BASE_URL);
      await dp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
      const neu4 = dp.locator('button', { hasText: 'Neues Spiel' });
      if (await neu4.count()) await neu4.click();
      await dp.waitForTimeout(200);
      const oberflaeche = {
        erweiterungen: await dp.locator('.expRow').count(),
        monumente: await dp.locator('.opt.toggle').count(),
        hinweis: await dp.locator('.dailyPureHint').count()
      };
      await dp.locator('.bar button.big').click();
      await dp.locator('.board').first().waitFor({ timeout: 8000 });
      const partie = await dp.evaluate(() => {
        const st = JSON.parse(localStorage.getItem('tinytowns.save.v1'));
        return {
          dailyId: st.config.dailyId ?? null,
          sets: st.config.sets,
          karten: st.config.activeCards.length,
          monumente: st.config.monumentDeals[0].length,
          systeme: st.config.systems,
          rathaus: st.config.townHall === true,
          deck: (st.soloDeck ?? []).slice(0, 6).join('')
        };
      });
      await ctx.close();
      return { oberflaeche, partie };
    };

    const tages = await starte('daily');
    if (tages.oberflaeche.erweiterungen !== 0) {
      fail(`Challenge pur: ${tages.oberflaeche.erweiterungen} Erweiterungs-Häkchen stehen noch da`);
    }
    if (tages.oberflaeche.monumente !== 0) fail('Challenge pur: Monument-Schalter steht noch da');
    if (tages.oberflaeche.hinweis === 0) fail('Challenge pur: keine Begründung, warum die Häkchen fehlen');
    if (tages.partie.dailyId === null) fail('Challenge pur: keine Tages-Challenge gestartet');
    if (JSON.stringify(tages.partie.sets) !== JSON.stringify(['base'])) {
      fail(`Challenge pur: Erweiterungen in der Partie (${tages.partie.sets})`);
    }
    if (tages.partie.karten !== 7) fail(`Challenge pur: ${tages.partie.karten} Karten statt 7`);
    if (tages.partie.monumente !== 2) fail('Challenge pur: keine Monumente ausgeteilt');
    if (tages.partie.rathaus) fail('Challenge pur: Rathaus ist an');
    for (const [name, an] of Object.entries(tages.partie.systeme)) {
      if (an) fail(`Challenge pur: System „${name}" ist an`);
    }

    // Gegenprobe: Im freien Solo wirken die gemerkten Erweiterungen weiter —
    // nur Eisenbahn, Rathaus und Höhle bleiben aus (Mehrspieler-Regeln).
    const frei = await starte('free');
    if (frei.oberflaeche.erweiterungen === 0) fail('Freies Solo: Erweiterungs-Häkchen fehlen');
    if (frei.partie.dailyId !== null) fail('Freies Solo: doch eine Tages-Challenge gestartet');
    if (!frei.partie.sets.includes('fortune')) fail('Freies Solo: Fortune kam nicht in der Partie an');
    if (!frei.partie.systeme.coins) fail('Freies Solo: Münzen sind aus');
    if (frei.partie.systeme.train) fail('Freies Solo: die Eisenbahn ist an (Mehrspieler-Regel)');
    if (frei.partie.rathaus) fail('Freies Solo: das Rathaus ist an (Mehrspieler-Regel)');
    console.log('✓ Tages-Challenge pur: gemerkte Häkchen schlagen nicht durch, freies Solo behält sie');
  }

  // Zu zweit gibt es nur zwei Plätze: unten und oben. Vier Ecken zur Wahl zu
  // stellen war nicht nur sinnlos — „unten links" und „unten rechts" fielen auf
  // dieselbe Tischhälfte, beide Bretter landeten im selben Feld und lagen
  // übereinander. Geprüft wird beides: die Auswahl ist weg, und ein Spielstand
  // mit kollidierenden Ecken wird trotzdem richtig aufgebaut.
  {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: 'de-DE' });
    const zp = await ctx.newPage();
    zp.on('pageerror', (e) => fail(`Zwei Plätze: Seitenfehler: ${e.message}`));
    await zp.goto(BASE_URL);
    await zp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    const neu5 = zp.locator('button', { hasText: 'Neues Spiel' });
    if (await neu5.count()) await neu5.click();

    // Ecken-Wahl: zu zweit keine, ab drei Spielern eine je Spieler
    for (const [anzahl, erwartet] of [[2, 0], [3, 3], [4, 4]]) {
      await zp.locator('.seg button', { hasText: String(anzahl) }).first().click();
      await zp.waitForTimeout(150);
      const da = await zp.locator('.playerRow select').count();
      if (da !== erwartet) {
        fail(`Zwei Plätze: bei ${anzahl} Spielern ${da} Ecken-Auswahlen statt ${erwartet}`);
      }
    }

    await zp.locator('.seg button', { hasText: '2' }).first().click();
    await zp.locator('.bar button.big').click();
    await zp.locator('.board').first().waitFor({ timeout: 8000 });
    await zp.waitForTimeout(400);

    const messen = async (wann) => {
      const g = await zp.evaluate(() => {
        const slots = [...document.querySelectorAll('.slot')].map((s) => {
          const r = s.getBoundingClientRect();
          return { area: getComputedStyle(s).gridArea, top: Math.round(r.top), unten: Math.round(r.bottom) };
        });
        const bretter = [...document.querySelectorAll('.board')].map((b) => {
          const r = b.getBoundingClientRect();
          return { top: Math.round(r.top), unten: Math.round(r.bottom) };
        });
        return { slots, bretter, ecken: JSON.parse(localStorage.getItem('tinytowns.save.v1')).config.players.map((p) => p.corner) };
      });
      if (g.slots.length !== 2) fail(`Zwei Plätze (${wann}): ${g.slots.length} Plätze gerendert`);
      if (g.slots[0].area === g.slots[1].area) {
        fail(`Zwei Plätze (${wann}): beide im Feld „${g.slots[0].area}" — Bretter liegen übereinander`);
      }
      if (g.bretter.length !== 2) fail(`Zwei Plätze (${wann}): ${g.bretter.length} Bretter`);
      // Ein Brett oben, eines unten: die Kästen dürfen sich nicht überlappen
      const [a, b] = g.bretter.sort((x, y) => x.top - y.top);
      if (a.unten > b.top) fail(`Zwei Plätze (${wann}): Bretter überlappen (${a.unten} > ${b.top})`);
      return g;
    };
    await messen('frisch gestartet');

    // Alter Spielstand mit zwei Ecken derselben Tischhälfte (0 und 1): Das
    // Layout darf sich davon nicht mehr beirren lassen.
    await zp.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('tinytowns.save.v1'));
      st.config.players[0].corner = 0;
      st.config.players[1].corner = 1;
      st.players[0].corner = 0;
      st.players[1].corner = 1;
      localStorage.setItem('tinytowns.save.v1', JSON.stringify(st));
    });
    await zp.reload();
    await zp.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });
    await zp.locator('button', { hasText: 'Weiterspielen' }).click();
    await zp.locator('.board').first().waitFor({ timeout: 8000 });
    await zp.waitForTimeout(400);
    const alt = await messen('alter Spielstand, Ecken 0 und 1');
    if (JSON.stringify(alt.ecken) !== JSON.stringify([0, 1])) {
      fail(`Zwei Plätze: Testaufbau griff nicht (Ecken ${alt.ecken})`);
    }
    await ctx.close();
    console.log('✓ Zwei Spieler: keine Ecken-Wahl, Bretter nie im selben Feld');
  }

  // Manifest: Ohne id/scope/start_url kann Chrome einen geteilten Link nicht an
  // die installierte App geben — und navigate-existing hält es bei einem
  // Fenster. (Auf iOS hilft beides nicht, dort führt die Tageswahl hin.)
  {
    const mf = await fetch(new URL('manifest.webmanifest', BASE_URL)).then((r) => r.json());
    for (const key of ['id', 'scope', 'start_url']) {
      if (!mf[key]) fail(`Manifest: ${key} fehlt — Links landen immer im Browser`);
    }
    if (mf.launch_handler?.client_mode !== 'navigate-existing') {
      fail('Manifest: launch_handler fehlt oder öffnet ein zweites Fenster');
    }
    console.log('✓ Manifest: Geltungsbereich und Start gesetzt, Links ins offene Fenster');
  }

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
