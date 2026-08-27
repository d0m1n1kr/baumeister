// Eine Stelle, an der aus Spielerliste und gewählten Erweiterungen die
// Partie-Konfiguration entsteht — Setup-Bildschirm und Host-Lobby nutzen
// dieselbe, damit beide Wege nicht auseinanderdriften können.

import { catalog } from '../data';
import { systemActive } from '../data/sets';
import { dailySeed, mulberry32, randomSeed, randomSetup } from '../engine/registry';
import type { GameConfig } from '../engine/types';

export function buildGameConfig(
  players: { name: string; corner: number }[],
  sets: string[],
  useMonuments: boolean,
  cavern = false,
  opts: {
    solo?: boolean;
    dailyId?: string;
    townHall?: boolean;
    train?: boolean;
    /** Landpartie: 5×6 mit Landschaft und Anlieger-Karten (jede Spielerzahl). */
    land?: boolean;
  } = {}
): GameConfig {
  const land = opts.land ?? false;
  // Eigener Seed-Stamm je Modus: Die Landpartie desselben Tages darf nicht
  // die klassische Auslage verraten (und umgekehrt).
  const seed = opts.dailyId ? dailySeed(opts.dailyId, land ? 'land-' : '') : randomSeed();
  const config = randomSetup(
    catalog,
    players,
    useMonuments,
    mulberry32(seed),
    sets,
    {
      coins: systemActive(sets, 'coins'),
      trees: systemActive(sets, 'trees'),
      cavern
    },
    opts.solo ?? false,
    opts.townHall ?? false,
    opts.train ?? false,
    land
  );
  config.dailyId = opts.dailyId;
  config.gameId = randomSeed().toString(36) + Date.now().toString(36);
  return config;
}

/** Heutiges Datum als Challenge-Kennung (lokale Zeitzone). */
export function todayId(): string {
  return dayId(new Date());
}

/** Ein Datum als Challenge-Kennung (YYYY-MM-DD, lokale Zeitzone). */
export function dayId(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Wie weit zurück man blättern darf. Genug für „die Challenge von letzter
 * Woche", ohne eine Liste zu werden.
 */
export const DAILY_HISTORY = 14;

/**
 * Challenge-Kennung um `delta` Tage verschieben.
 *
 * Über die Datumsteile gerechnet, nicht über Millisekunden: Bei Sommerzeit
 * hat ein Tag 23 oder 25 Stunden, und „+86400000" landet dann im falschen Tag.
 * `new Date(y, m, d + delta)` rollt Monat und Jahr selbst korrekt weiter.
 */
export function shiftDay(id: string, delta: number): string {
  const [y, m, d] = id.split('-').map(Number);
  return dayId(new Date(y, m - 1, d + delta));
}

/**
 * Darf dieser Tag gespielt werden? Heute und die letzten DAILY_HISTORY Tage —
 * die Zukunft nicht: Deren Auslage wäre sonst vorab bekannt.
 */
export function dayPlayable(id: string, today = todayId()): boolean {
  return id <= today && id >= shiftDay(today, -DAILY_HISTORY);
}
