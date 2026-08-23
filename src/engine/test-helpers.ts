// Hilfsfunktionen für Engine-Tests.

import { catalog } from '../data';
import type { GameConfig, GameState, Resource } from './types';
import { newGame } from './game';

export { catalog };

export const ACTIVE_DEFAULT = [
  'cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'factory'
];

export function config(
  n = 2,
  activeCards: string[] = ACTIVE_DEFAULT,
  useMonuments = false,
  monumentDeals?: string[][],
  systems: { coins?: boolean; trees?: boolean } = {}
): GameConfig {
  return {
    players: Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, corner: i })),
    activeCards,
    monumentDeals: monumentDeals ?? Array.from({ length: n }, () => []),
    firstMasterBuilder: 0,
    useMonuments,
    sets: ['base'],
    systems: { coins: systems.coins ?? false, trees: systems.trees ?? false }
  };
}

export function freshGame(
  n = 2,
  activeCards: string[] = ACTIVE_DEFAULT,
  useMonuments = false,
  monumentDeals?: string[][],
  systems: { coins?: boolean; trees?: boolean } = {}
): GameState {
  return newGame(config(n, activeCards, useMonuments, monumentDeals, systems));
}

/** Gebäude direkt aufs Brett setzen (Test-Abkürzung). */
export function put(
  s: GameState, player: number, square: number, card: string,
  extra?: { marked?: Resource; stored?: Resource[]; stock?: string[] }
): void {
  s.players[player].board[square].building = { card, ...extra };
}

/** Material direkt aufs Brett legen (Test-Abkürzung). */
export function res(s: GameState, player: number, square: number, r: Resource): void {
  s.players[player].board[square].resource = r;
}

/** Zustand in eine laufende Runde mit angesagtem Material versetzen. */
export function inRound(s: GameState, resource: Resource = 'wood'): GameState {
  s.phase = { t: 'round', resource };
  s.round = Math.max(1, s.round);
  for (const p of s.players) {
    if (!p.done) {
      p.pending = resource;
      p.roundDone = false;
    }
  }
  return s;
}
