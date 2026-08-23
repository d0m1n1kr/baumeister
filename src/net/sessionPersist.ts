// Persistenz der Mehrgeräte-Sitzung: Unter iOS wird der Browser-Tab beim
// Wechsel in eine andere App gern komplett neu geladen — ohne diese Ablage
// wäre der Gast aus der Partie geflogen und der Raum-Code (nach Spielstart
// nirgends mehr sichtbar) verloren. Der Host legt zusätzlich die Sitzplätze
// samt Gerätekennungen ab, damit „Weiterspielen" den Raum wieder öffnet und
// alle Gäste ihre Plätze zurückbekommen.

import type { Seat } from './seats';

const KEY = 'tinytowns.session.v1';

/** Beim Tab-zu-Tab-Transport (`?transport=channel`) teilen sich alle Tabs den
 *  localStorage — dort gilt die Sitzung je Tab, wie die Gerätekennung. */
function storage(): Storage {
  const perTab = new URLSearchParams(location.search).get('transport') === 'channel';
  return perTab ? sessionStorage : localStorage;
}

export interface StoredSession {
  role: 'host' | 'guest';
  code: string;
  /** Gast: gewählter Name für den Wiederbeitritt. */
  name?: string;
  /** Host: Sitzplätze ohne flüchtige Verbindungsdaten. */
  seats?: Array<Pick<Seat, 'index' | 'name' | 'corner' | 'kind' | 'clientId'>>;
  setup?: { sets: string[]; useMonuments: boolean; cavern?: boolean };
}

export function saveSession(s: StoredSession): void {
  try {
    storage().setItem(KEY, JSON.stringify(s));
  } catch {
    // privater Modus / Speicher voll — Sitzung läuft ohne Wiederbeitritt weiter
  }
}

export function loadSession(): StoredSession | null {
  try {
    const raw = storage().getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if ((s?.role !== 'host' && s?.role !== 'guest') || typeof s.code !== 'string') return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    storage().removeItem(KEY);
  } catch {
    // ignorieren
  }
}

/** Abgelegte Plätze wieder in Sitzplätze verwandeln: Remote-Plätze starten
 *  getrennt, die Gerätekennungen bleiben — Gäste erkennen sich beim hello. */
export function restoreSeats(stored: NonNullable<StoredSession['seats']>): Seat[] {
  return stored.map((s) => ({
    index: s.index,
    name: s.name,
    corner: s.corner,
    kind: s.kind,
    clientId: s.clientId,
    connected: s.kind === 'local'
  }));
}
