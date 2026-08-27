// Erzeugt die Screenshots für das README — reproduzierbar statt von Hand.
//
// Warum als Skript: Die Bilder veralten mit jedem Design-Schritt, und von Hand
// gemachte Aufnahmen sind nicht wiederholbar (andere Auslage, anderer Zufall,
// andere Fenstergröße). Hier steht jede Aufnahme als Rezept: Viewport,
// Spielstand, Zustand. Aufruf: `node scripts/shots.mjs`.
//
// Die Spielstände werden gesetzt, nicht gespielt: Eine echte Partie
// durchzuklicken wäre lang und würfelte jedes Mal eine andere Auslage. Statt
// dessen wird der Spielstand im localStorage gezielt gefüllt (dieselbe Technik
// wie im Smoke-Test) — mit festem Seed, damit dieselben Karten erscheinen.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4195;
const BASE = `http://localhost:${PORT}/`;
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;

const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: ['ignore', 'ignore', 'pipe']
});
server.stderr?.on('data', (d) => process.stderr.write(`[preview] ${d}`));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* Server startet noch */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Preview-Server nicht erreichbar');
}

/** Erstbesuch: kein alter Spielstand, keine Lern-Einladung im Bild. */
async function frischerKontext(browser, viewport, extra = '') {
  const ctx = await browser.newContext({ viewport, locale: 'de-DE' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('SEITENFEHLER', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('tinytowns.learn.hint', '0');
    localStorage.setItem('tinytowns.install.hint', '0');
  });
  await page.goto(BASE + extra);
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 15000 });
  const neu = page.locator('button', { hasText: 'Neues Spiel' });
  if (await neu.count()) await neu.click();
  return { ctx, page };
}

/**
 * Eine Partie in der Mitte zeigen: Monumente sind gewählt, ein paar Gebäude und
 * Materialien liegen schon. Über den Spielstand gesetzt — die Bretter sollen
 * belebt aussehen, nicht leer.
 */
async function fuelleBretter(page, plan) {
  await page.evaluate((p) => {
    const st = JSON.parse(localStorage.getItem('tinytowns.save.v1'));
    const karten = st.config.activeCards.filter((c) => c !== 'train_station');
    st.players.forEach((spieler, i) => {
      // Über die FREIEN Felder zählen, nicht über den Feldindex: sonst fällt
      // das Muster in der Landpartie mit der Landschaft zusammen und ein Brett
      // bleibt leer.
      let k = i * 2;
      let n = 0;
      spieler.board.forEach((feld) => {
        if (feld.terrain) return;
        const rest = k % 5;
        if (rest === 0 && n < p.gebaeude) {
          feld.building = { card: karten[(k + i) % karten.length] };
          n++;
        } else if (rest === 2) {
          feld.resource = p.materialien[((k / 5) | 0) % p.materialien.length];
        }
        k++;
      });
      // Monument-Draft überspringen: die Auswahl ist im Bild nur ein Knopf
      if (!spieler.monument && spieler.monumentOptions?.length) {
        spieler.monument = { card: spieler.monumentOptions[0], built: false };
        spieler.monumentOptions = undefined;
      }
    });
    if (st.phase?.t === 'monumentDraft') st.phase = { t: 'nameResource' };
    localStorage.setItem('tinytowns.save.v1', JSON.stringify(st));
  }, plan);
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 15000 });
  await page.locator('button', { hasText: 'Weiterspielen' }).click();
  await page.locator('.board').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(900); // Bau-Animationen ausklingen lassen
}

/**
 * Ein Material ansagen, damit die Marken in den Panels liegen. Wer ansagen darf,
 * wechselt jede Runde — und der Wechsel braucht im Netz einen Moment, also wird
 * eine Weile auf die Auswahl gewartet, statt sie einmal zu suchen.
 */
async function sageAn(seiten, welches = 0) {
  for (let versuch = 0; versuch < 20; versuch++) {
    for (const seite of seiten) {
      const chips = seite.locator('.picker .chip');
      const anzahl = await chips.count();
      if (anzahl) {
        // Jede Runde ein anderes Material — sonst liegt am Ende nur Holz
        const chip = chips.nth(welches % anzahl);
        await chip.click();
        await seite.waitForTimeout(500);
        return true;
      }
    }
    await seiten[0].waitForTimeout(400);
  }
  return false;
}

/**
 * Ein paar Runden wirklich spielen: ansagen, jeder legt auf sein eigenes Brett.
 * Im Mehrgerätemodus geht das nicht über den Spielstand — ein Reload würde die
 * Sitzung zerreißen. Also der echte Weg.
 */
async function spieleRunden(sitze, runden) {
  const seiten = sitze.map((s) => s.page);
  for (let r = 0; r < runden; r++) {
    if (!(await sageAn(seiten, r))) return;
    for (const { page, seat } of sitze) {
      const feld = page.locator(`[data-player="${seat}"][data-square="${r * 5 + seat}"]`);
      await feld.click();
      await feld.locator('.res').waitFor({ timeout: 10000 });
    }
    // Die Runde endet erst, wenn jeder „Fertig" gedrückt hat
    for (const { page } of sitze) {
      const fertig = page.locator('button', { hasText: 'Fertig' }).first();
      if (await fertig.count()) await fertig.click();
    }
  }
}

/** Monument-Draft im echten Ablauf durchklicken (Mehrgerätemodus, kein Reload). */
async function draftDurchklicken(page) {
  for (let runde = 0; runde < 4; runde++) {
    const knopf = page.locator('button', { hasText: 'Monument wählen' }).first();
    if (!(await knopf.count())) return;
    await knopf.click();
    const bestaetigen = page.locator('.box button.primary', { hasText: 'Bestätigen' });
    if (await bestaetigen.count()) await bestaetigen.first().click();
    await page.locator('.pickCard').first().waitFor({ timeout: 10000 });
    await page.locator('.pickCard button.primary').first().click();
    await page.waitForTimeout(300);
  }
}

const shots = [];
let browser;
try {
  await waitForServer();
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ---------- 1. Vier Spieler an einem Tablet ----------
  {
    const { ctx, page } = await frischerKontext(browser, { width: 1180, height: 820 });
    await page.locator('.seg button', { hasText: '4' }).first().click();
    for (const [i, name] of ['Anna', 'Ben', 'Cem', 'Dana'].entries()) {
      await page.locator('.players input').nth(i).fill(name);
    }
    await page.locator('.bar button.big').click();
    await page.locator('.board').first().waitFor({ timeout: 10000 });
    await fuelleBretter(page, { gebaeude: 4, materialien: ['wood', 'brick', 'glass', 'wheat', 'stone'] });
    await sageAn([page]);
    await page.screenshot({ path: `${OUT}tablet-table.png` });
    shots.push('tablet-table.png');
    await ctx.close();
  }

  // ---------- 2. Landpartie: 5×6 mit Landschaft ----------
  // Hochkant-Tablet: nur so liegen beide 5×6-Bretter UND alle 10 Karten im Bild.
  {
    const { ctx, page } = await frischerKontext(browser, { width: 820, height: 1180 });
    await page.locator('.seg button', { hasText: '2' }).first().click();
    await page.locator('.players input').nth(0).fill('Anna');
    await page.locator('.players input').nth(1).fill('Ben');
    await page.locator('.landOpt input').check();
    await page.locator('.bar button.big').click();
    await page.locator('.board').first().waitFor({ timeout: 10000 });
    await fuelleBretter(page, { gebaeude: 5, materialien: ['wood', 'stone', 'glass', 'wheat', 'brick'] });
    await sageAn([page]);
    await page.screenshot({ path: `${OUT}countryside.png` });
    shots.push('countryside.png');
    await ctx.close();
  }

  // ---------- 3. Solo am Handy (Alice-Modus: Karten offen) ----------
  {
    const { ctx, page } = await frischerKontext(browser, { width: 402, height: 874 });
    await page.locator('.seg button', { hasText: '1' }).first().click();
    await page.locator('.players input').first().fill('Anna');
    await page.locator('.bar button.big').click();
    await page.locator('.board').first().waitFor({ timeout: 10000 });
    await fuelleBretter(page, { gebaeude: 3, materialien: ['wood', 'brick', 'glass'] });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}solo-phone.png` });
    shots.push('solo-phone.png');
    await ctx.close();
  }

  // ---------- 4./5./6. Mehrgerätemodus: Lobby, Gast, Host-Tisch ----------
  // BroadcastChannel wirkt nur innerhalb EINES Kontexts → beide Tabs darin.
  {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: 'de-DE' });
    const host = await ctx.newPage();
    host.on('pageerror', (e) => console.error('HOST-SEITENFEHLER', e.message));
    await host.addInitScript(() => {
      localStorage.setItem('tinytowns.learn.hint', '0');
      localStorage.setItem('tinytowns.install.hint', '0');
    });
    await host.goto(`${BASE}?transport=channel`);
    await host.locator('#splash').waitFor({ state: 'detached', timeout: 15000 });
    const neu = host.locator('button', { hasText: 'Neues Spiel' });
    if (await neu.count()) await neu.click();
    await host.locator('.seg button', { hasText: '3' }).first().click();
    await host.locator('.players input').nth(0).fill('Dominik');
    await host.locator('.seg button', { hasText: 'Mit eigenen' }).click();
    await host.locator('button', { hasText: 'Raum öffnen' }).click();
    const code = (await host.locator('.value').first().textContent())?.trim();

    // Zwei Gäste treten bei, damit die Lobby belegt aussieht
    const gaeste = [];
    for (const [name, viewport] of [
      ['Anna', { width: 402, height: 874 }],
      ['Ben', { width: 402, height: 874 }]
    ]) {
      const g = await ctx.newPage();
      g.on('pageerror', (e) => console.error(`GAST-SEITENFEHLER (${name})`, e.message));
      await g.setViewportSize(viewport);
      await g.goto(`${BASE}?transport=channel#join=${code}`);
      await g.locator('input[placeholder="Dein Name"]').fill(name);
      await g.locator('button', { hasText: 'Beitreten' }).click();
      await host.locator('.seats li', { hasText: name }).waitFor({ timeout: 15000 });
      gaeste.push(g);
    }
    await host.waitForTimeout(400);
    await host.screenshot({ path: `${OUT}lan-lobby.png` });
    shots.push('lan-lobby.png');

    await host.locator('button', { hasText: 'Spiel starten' }).click();
    await host.locator('.table').waitFor({ timeout: 15000 });
    for (const g of gaeste) await g.locator('.solo').waitFor({ timeout: 15000 });

    // Monumente wählen (sonst stünde der Tisch im Draft), dann ansagen
    for (const seite of [host, ...gaeste]) await draftDurchklicken(seite);
    await host.locator('button', { hasText: 'Monument wählen' }).first().waitFor({ state: 'detached', timeout: 15000 });
    const hostSitz = await host.evaluate(
      () => JSON.parse(localStorage.getItem('tinytowns.save.v1')).config.players
        .findIndex((p) => p.name === 'Dominik')
    );
    const sitze = [{ page: host, seat: hostSitz }];
    for (const g of gaeste) {
      const seat = await g.evaluate(() =>
        Number(document.querySelector('.own [data-player]')?.getAttribute('data-player'))
      );
      sitze.push({ page: g, seat });
    }
    await spieleRunden(sitze, 3);
    if (!(await sageAn([host, ...gaeste]))) throw new Error('Niemand konnte ansagen');
    await host.locator('.pendingWrap').first().waitFor({ timeout: 15000 });
    await host.waitForTimeout(800);
    await host.screenshot({ path: `${OUT}lan-host-table.png` });
    shots.push('lan-host-table.png');

    await gaeste[0].waitForTimeout(400);
    await gaeste[0].screenshot({ path: `${OUT}lan-guest-phone.png` });
    shots.push('lan-guest-phone.png');
    await ctx.close();
  }

  console.log(`Screenshots erzeugt in docs/screenshots/:\n  ${shots.join('\n  ')}`);
} finally {
  await browser?.close();
  server.kill();
}
