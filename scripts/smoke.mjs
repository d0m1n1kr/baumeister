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

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
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
  page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  page.on('pageerror', (e) => fail(`Seitenfehler: ${e.message}`));
  await page.goto(BASE_URL);

  // Setup: 2 Spieler, ohne Monumente
  await page.locator('.seg button', { hasText: '2' }).click();
  await page.locator('.toggle input[type="checkbox"]').click();
  await page.locator('button', { hasText: 'Los geht’s!' }).click();
  console.log('✓ Setup');

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
  await done2.first().click();
  await page.locator('.picker').waitFor({ timeout: 5000 });
  console.log('✓ Platzieren per Tipp + Verschieben');

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

  console.log('Smoke-Test bestanden.');
} finally {
  await browser?.close();
  server.kill();
}
