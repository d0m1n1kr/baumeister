// Eine Stelle, an der aus Spielerliste und gewählten Erweiterungen die
// Partie-Konfiguration entsteht — Setup-Bildschirm und Host-Lobby nutzen
// dieselbe, damit beide Wege nicht auseinanderdriften können.

import { catalog } from '../data';
import { systemActive } from '../data/sets';
import { mulberry32, randomSeed, randomSetup } from '../engine/registry';
import type { GameConfig } from '../engine/types';

export function buildGameConfig(
  players: { name: string; corner: number }[],
  sets: string[],
  useMonuments: boolean,
  cavern = false
): GameConfig {
  return randomSetup(catalog, players, useMonuments, mulberry32(randomSeed()), sets, {
    coins: systemActive(sets, 'coins'),
    trees: systemActive(sets, 'trees'),
    cavern
  });
}
