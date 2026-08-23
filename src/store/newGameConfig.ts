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
  opts: { solo?: boolean; dailyId?: string } = {}
): GameConfig {
  const seed = opts.dailyId ? dailySeed(opts.dailyId) : randomSeed();
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
    opts.solo ?? false
  );
  config.dailyId = opts.dailyId;
  config.gameId = randomSeed().toString(36) + Date.now().toString(36);
  return config;
}

/** Heutiges Datum als Challenge-Kennung (lokale Zeitzone). */
export function todayId(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
