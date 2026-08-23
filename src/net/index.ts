// Auswahl des Transports. Standard ist die echte P2P-Verbindung; mit
// `?transport=channel` läuft alles über BroadcastChannel — dieselbe Logik,
// aber zwischen zwei Tabs desselben Geräts (für Entwicklung und E2E-Tests).

import { createChannelTransport } from './channelTransport';
import { createTrysteroTransport, relayStatus } from './trysteroTransport';
import type { TransportFactory } from './transport';

export function selectedTransport(): TransportFactory {
  try {
    if (new URLSearchParams(location.search).get('transport') === 'channel') {
      return createChannelTransport;
    }
  } catch {
    // location nicht verfügbar (Tests) — Standard verwenden
  }
  return createTrysteroTransport;
}

/** Erreichbarkeit der Vermittlungs-Relays (nur beim echten P2P-Transport). */
export function signalingStatus(): { open: number; total: number } | null {
  return selectedTransport() === createTrysteroTransport ? relayStatus() : null;
}

/** Beitritts-Code aus der Adresszeile (`#join=ABC234`), z. B. nach QR-Scan. */
export function joinCodeFromUrl(): string | null {
  try {
    const match = /[#&]join=([A-Za-z0-9]{1,8})/.exec(location.hash);
    return match ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

export function joinUrlFor(code: string): string {
  const url = new URL(location.href);
  url.hash = `join=${code}`;
  return url.toString();
}

export function clearJoinHash(): void {
  try {
    if (location.hash.includes('join=')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch {
    // ignorieren
  }
}
