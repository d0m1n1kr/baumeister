// End-to-End-Test des Mehrgerätemodus mit zwei Tabs.
// Der Transport läuft über BroadcastChannel (?transport=channel) — dieselbe
// Sitzungs- und Host-Logik wie bei echtem P2P, aber ohne Netz und damit CI-tauglich.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 4192;
const BASE_URL = `http://localhost:${PORT}/?transport=channel`;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

// Direkt die Binärdatei starten (nicht über npx): sonst überlebt der
// eigentliche Vite-Prozess das Beenden der Hülle und blockiert den Port.
const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: ['ignore', 'ignore', 'pipe']
});
server.stderr?.on('data', (d) => process.stderr.write(`[preview] ${d}`));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return;
    } catch {
      /* Server startet noch */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  fail('Preview-Server nicht erreichbar');
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // BroadcastChannel wirkt nur innerhalb eines Kontexts → beide Tabs im selben Kontext
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });

  const host = await context.newPage();
  host.on('pageerror', (e) => fail(`Host-Seitenfehler: ${e.message}`));
  await host.goto(BASE_URL);
  const neu = host.locator('button', { hasText: 'Neues Spiel' });
  if (await neu.count()) await neu.click();

  // Host: 2 Spieler, Platz 2 auf eigenem Gerät, ohne Monumente
  await host.locator('.seg button', { hasText: '2' }).click();
  await host.locator('.toggle input[type="checkbox"]').first().click(); // Monumente aus
  await host.locator('.modeRow button', { hasText: 'Mit eigenen Geräten' }).click();
  await host.locator('button', { hasText: 'Raum öffnen' }).click();

  const code = (await host.locator('.value').first().textContent())?.trim();
  if (!code || code.length !== 6) fail(`Kein Raum-Code angezeigt: ${code}`);
  console.log(`✓ Raum geöffnet (Code ${code})`);

  // Gast: zweiter Tab tritt bei
  const guest = await context.newPage();
  guest.on('pageerror', (e) => fail(`Gast-Seitenfehler: ${e.message}`));
  await guest.goto(`${BASE_URL}#join=${code}`);
  await guest.locator('input[placeholder="Name"]').fill('Anna');
  await guest.locator('button', { hasText: 'Beitreten' }).click();

  await host.locator('.seats li', { hasText: 'Anna' }).waitFor({ timeout: 10000 });
  await guest.locator('text=Warte auf den Start').waitFor({ timeout: 10000 });
  console.log('✓ Gast beigetreten und in der Lobby sichtbar');

  // Host startet
  await host.locator('button', { hasText: 'Spiel starten' }).click();
  // Wer Baumeister wird, entscheidet der Zufall — der Host sieht in jedem Fall den Tisch.
  await host.locator('.table').waitFor({ timeout: 10000 });
  await guest.locator('.solo').waitFor({ timeout: 10000 });
  console.log('✓ Partie gestartet, Gast sieht seine eigene Ansicht');

  // Host ist Baumeister oder der Gast — wer die Auswahl hat, sagt an
  const hostPicker = host.locator('.picker .chip[title="Holz"]');
  const guestPicker = guest.locator('.picker .chip[title="Holz"]');
  if (await hostPicker.count()) await hostPicker.click();
  else await guestPicker.click();
  await host.locator('.pendingWrap').first().waitFor({ timeout: 10000 });
  await guest.locator('.pendingWrap').first().waitFor({ timeout: 10000 });
  console.log('✓ Material angesagt und auf beiden Geräten angekommen');

  // Gast platziert auf seinem eigenen Brett
  const guestSeat = await guest.evaluate(() =>
    Number(document.querySelector('.own [data-player]')?.getAttribute('data-player'))
  );
  await guest.locator(`[data-player="${guestSeat}"][data-square="5"]`).click();
  await guest.locator(`[data-player="${guestSeat}"][data-square="5"] .res`).waitFor({ timeout: 10000 });
  // ... und der Host sieht es
  await host
    .locator(`[data-player="${guestSeat}"][data-square="5"] .res`)
    .waitFor({ timeout: 10000 });
  console.log('✓ Zug des Gastes ist beim Host angekommen');

  // Der Gast darf fremde Bretter nicht bedienen
  const otherSeat = guestSeat === 0 ? 1 : 0;
  const before = await guest.locator(`[data-player="${otherSeat}"] .res`).count();
  await guest.locator(`[data-player="${otherSeat}"][data-square="9"]`).click({ force: true });
  await guest.waitForTimeout(400);
  const after = await guest.locator(`[data-player="${otherSeat}"] .res`).count();
  if (after !== before) fail('Gast konnte ein fremdes Brett verändern');
  console.log('✓ Fremde Bretter sind für den Gast gesperrt');

  console.log('Mehrgeräte-Smoke-Test bestanden.');
} finally {
  await browser?.close();
  server.kill();
}
