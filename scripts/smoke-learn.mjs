// End-to-End-Test des Lernmodus (Chromium): Solo-Lernspiel starten, die
// Erklärblasen Phase für Phase durchlaufen und dabei MESSEN, dass die Blase
// weder Brett noch Knöpfe überdeckt — am Handy war jeder verdeckte Knopf ein
// verlorener Zug. Läuft in zwei Viewports (Handy und Tablet).
// Mit LEARN_SHOTS=<Verzeichnis> werden zusätzlich Screenshots abgelegt.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4175;
const BASE_URL = `http://localhost:${PORT}/`;
const SHOTS = process.env.LEARN_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

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

/** Titel der aktuell sichtbaren Blase (oder null). */
async function bubbleTitle(page) {
  const bubble = page.locator('.bubble');
  if ((await bubble.count()) === 0) return null;
  return (await bubble.locator('.title').innerText()).replace('🎓', '').trim();
}

function overlaps(a, b) {
  return (
    a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 &&
    a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1
  );
}

/** Die Blase darf Brett und Bedienelemente niemals überdecken. */
async function assertClear(page, where) {
  const bubble = page.locator('.bubble.ready'); // erst nach der Positionsmessung
  await bubble.waitFor({ timeout: 5000 });
  const box = await bubble.boundingBox();
  if (!box) fail(`${where}: Blase nicht sichtbar`);
  const view = page.viewportSize();
  if (box.x < 0 || box.y < 0 || box.x + box.width > view.width + 1) {
    fail(`${where}: Blase ragt aus dem Bild (${JSON.stringify(box)})`);
  }
  const board = await page.locator('.boardWrap').boundingBox();
  if (board && overlaps(box, board)) fail(`${where}: Blase überdeckt das Brett`);
  const buttons = page.locator('.panel button');
  for (let i = 0; i < (await buttons.count()); i++) {
    const b = await buttons.nth(i).boundingBox();
    if (b && overlaps(box, b)) {
      fail(`${where}: Blase überdeckt einen Knopf (${await buttons.nth(i).innerText()})`);
    }
  }
}

async function run(browser, label, viewport) {
  const context = await browser.newContext({ viewport, locale: 'de-DE' });
  const page = await context.newPage();
  page.on('pageerror', (e) => fail(`${label}: Seitenfehler: ${e.message}`));
  await page.goto(BASE_URL);
  // Lade-Splash abwarten — sonst liegt er über den Screenshots
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 10000 });

  // Setup: 1 Spieler → Lernspiel
  await page.locator('.seg button', { hasText: '1' }).first().click();
  await page.locator('.seg button', { hasText: 'Lernspiel' }).click();
  await page.locator('button', { hasText: 'Los geht’s!' }).click();

  // 1) Einführung
  await page.locator('.bubble.ready').waitFor({ timeout: 5000 });
  if (!(await bubbleTitle(page))?.includes('4')) fail(`${label}: Einführungsblase fehlt`);
  await assertClear(page, `${label}/Einführung`);
  if (SHOTS) await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/learn-${label}-welcome.png` });
  await page.locator('.bubble button.primary').click();

  // 2) Monument-Draft
  if ((await bubbleTitle(page)) !== 'Monument wählen') {
    fail(`${label}: Monument-Blase fehlt (${await bubbleTitle(page)})`);
  }
  await assertClear(page, `${label}/Monument`);
  await page.locator('.bubble button.primary').click();
  await page.locator('.panel button', { hasText: 'Monument wählen' }).click();
  await page.locator('.pick .pickCard button', { hasText: 'Bestätigen' }).first().click();

  // 3) Deck-Auswahl
  await page.locator('.picker.offer').waitFor({ timeout: 5000 });
  if ((await bubbleTitle(page)) !== 'Material aus dem Deck') {
    fail(`${label}: Deck-Blase fehlt (${await bubbleTitle(page)})`);
  }
  await assertClear(page, `${label}/Deck`);
  await page.locator('.bubble button.primary').click();
  console.log(`✓ ${label}: Blasen für Einführung, Monument und Deck-Wahl`);

  // 4) Runden spielen: immer dem Vorschlag folgen, bis ein Bau möglich ist
  let built = false;
  for (let round = 1; round <= 10 && !built; round++) {
    if ((await page.locator('.picker.offer').count()) > 0) {
      await page.locator('.picker.offer .offerChip').first().click();
    }
    await page.locator('.pendingWrap .chip').waitFor({ timeout: 5000 });

    if (round === 1) {
      if ((await bubbleTitle(page)) !== 'Material platzieren') {
        fail(`${label}: Platzier-Blase fehlt (${await bubbleTitle(page)})`);
      }
      await assertClear(page, `${label}/Platzieren`);
      const tip = await page.locator('.learnTip').innerText();
      if (!tip.includes('Vorschlag')) fail(`${label}: Vorschlagszeile fehlt`);
      if ((await page.locator('.cell.suggest').count()) === 0) {
        fail(`${label}: kein vorgeschlagenes Feld markiert`);
      }
      if (SHOTS) await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/learn-${label}-place.png` });
      await page.locator('.bubble button.primary').click();
      console.log(`✓ ${label}: Platzier-Blase mit markiertem Vorschlagsfeld`);
    }

    // Dem Vorschlag folgen (sonst das erste freie Feld)
    const suggested = page.locator('.cell.suggest');
    if ((await suggested.count()) > 0) {
      await suggested.first().click();
    } else {
      const cells = page.locator('.boardWrap [data-square]');
      for (let i = 0; i < (await cells.count()); i++) {
        const cell = cells.nth(i);
        if ((await cell.locator('.res, .building').count()) === 0) {
          await cell.click();
          break;
        }
      }
    }

    if ((await bubbleTitle(page)) === 'Bauen') {
      await assertClear(page, `${label}/Bauen`);
      if (SHOTS) await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/learn-${label}-build.png` });
      await page.locator('.bubble button.primary').click();

      // Bau-Flow: Felder markieren → Karte → Bauplatz, mit Blase je Schritt
      await page.locator('.panel button', { hasText: '🔨' }).click();
      if ((await bubbleTitle(page)) !== 'Felder markieren') {
        fail(`${label}: Markier-Blase fehlt (${await bubbleTitle(page)})`);
      }
      await assertClear(page, `${label}/Markieren`);
      await page.locator('.bubble button.primary').click();
      // Vorgeschlagene Felder MERKEN: die Klasse bleibt beim Antippen stehen,
      // ein erneutes Tippen würde die Markierung wieder aufheben.
      const marks = await page.locator('.cell.suggest').evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-square'))
      );
      if (marks.length === 0) fail(`${label}: Bau-Vorschlag markiert keine Felder`);
      for (const sq of marks) await page.locator(`.boardWrap [data-square="${sq}"]`).click();
      await page.locator('.matches .mini').first().click();
      if ((await bubbleTitle(page)) !== 'Bauplatz wählen') {
        fail(`${label}: Bauplatz-Blase fehlt (${await bubbleTitle(page)})`);
      }
      await assertClear(page, `${label}/Bauplatz`);
      await page.locator('.bubble button.primary').click();
      await page.locator('.cell.highlight').first().click();
      await page.locator('.boardWrap .building').first().waitFor({ timeout: 5000 });
      built = true;
      console.log(`✓ ${label}: Blasen für Bauen, Markieren und Bauplatz`);
    }

    const done = page.locator('.panel button', { hasText: '✓ Fertig' });
    if ((await done.count()) > 0) await done.first().click();
    await page.waitForTimeout(120);
  }
  if (!built) fail(`${label}: in 10 Runden kein Bau möglich — Vorschläge greifen nicht`);

  // 5) Schalter in der Kartenleiste schaltet die Blasen ab
  await page.locator('.aliceBtn', { hasText: '🎓' }).click();
  if ((await page.locator('.bubble').count()) !== 0) fail(`${label}: 🎓-Schalter wirkt nicht`);
  await page.locator('.aliceBtn', { hasText: '🎓' }).click();
  console.log(`✓ ${label}: 🎓-Schalter blendet die Blasen aus und wieder ein`);

  await context.close();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  await run(browser, 'tablet', { width: 1180, height: 820 });
  await run(browser, 'phone', { width: 390, height: 844 });
  console.log('Lernmodus-Test bestanden.');
} finally {
  await browser?.close();
  server.kill();
}
