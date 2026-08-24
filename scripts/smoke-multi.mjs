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
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: 'de-DE' });

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
  await guest.locator('input[placeholder="Dein Name"]').fill('Anna');
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

  // Gast lädt neu (iOS wirft Tabs im Hintergrund gern raus):
  // automatischer Wiederbeitritt ohne Code-Eingabe, Zustand kommt zurück
  await guest.reload();
  await guest.locator('.solo').waitFor({ timeout: 15000 });
  await guest
    .locator(`[data-player="${guestSeat}"][data-square="5"] .res`)
    .waitFor({ timeout: 10000 });
  console.log('✓ Gast-Reload: automatisch zurück in der Partie');

  // Host lädt neu: „Weiterspielen" stellt Partie UND Raum wieder her
  await host.reload();
  await host.locator('button', { hasText: 'Weiterspielen' }).click();
  await host.locator('.table').waitFor({ timeout: 15000 });
  await host
    .locator(`[data-player="${guestSeat}"][data-square="5"] .res`)
    .waitFor({ timeout: 10000 });
  // Der Gast verbindet sich von selbst neu (Banner verschwindet wieder)
  await guest.locator('.banner').waitFor({ state: 'hidden', timeout: 20000 });
  console.log('✓ Host-Reload: Raum wiederhergestellt, Gast automatisch neu verbunden');

  // QR-Handover: Host gibt seinen lokalen Platz frei — ein NEUES Gerät
  // (frischer Tab = frische Kennung) bekommt ihn mitten im Spiel
  await host.locator('.qrToggle').click();
  await host.locator('.dialog button', { hasText: 'Per QR übergeben' }).click();
  await host.locator('.dialog .state', { hasText: 'frei' }).waitFor({ timeout: 5000 });
  await host.locator('.dialog button', { hasText: 'Schließen' }).click();

  const fresh = await context.newPage();
  fresh.on('pageerror', (e) => fail(`Neues-Gerät-Seitenfehler: ${e.message}`));
  await fresh.goto(`${BASE_URL}#join=${code}`);
  await fresh.locator('input[placeholder="Dein Name"]').fill('Ben');
  await fresh.locator('button', { hasText: 'Beitreten' }).click();
  await fresh.locator('.solo').waitFor({ timeout: 15000 });
  // Das neue Gerät sieht den laufenden Spielstand (Zug des ersten Gastes)
  await fresh
    .locator(`[data-player="${guestSeat}"][data-square="5"] .res`)
    .waitFor({ timeout: 10000 });
  console.log('✓ QR-Handover: neues Gerät übernimmt einen freigegebenen Platz im Spiel');

  // QR-Scan bei BEREITS offener Seite: iOS feuert dann nur ein hashchange,
  // keinen Reload — die App muss trotzdem sofort zum Beitritt springen
  const idle = await context.newPage();
  await idle.goto(BASE_URL); // ohne Beitritts-Code: landet auf Weiterspielen/Setup
  await idle.locator('button', { hasText: /Weiterspielen|Los geht/ }).first().waitFor({ timeout: 10000 });
  await idle.evaluate((c) => (location.hash = `#join=${c}`), code);
  await idle.locator('.codeInput').waitFor({ timeout: 5000 });
  const prefilled = await idle.locator('.codeInput').inputValue();
  if (prefilled !== code) fail(`Code nicht übernommen: „${prefilled}" statt „${code}"`);
  console.log('✓ QR-Scan im offenen Tab: hashchange führt direkt zum Beitritt');

  console.log('Mehrgeräte-Smoke-Test bestanden.');
} finally {
  await browser?.close();
  server.kill();
}
