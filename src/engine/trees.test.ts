import { describe, it, expect } from 'vitest';
import { apply, RuleError } from './game';
import { scorePlayer } from './scoring';
import { catalog, freshGame, inRound, put, res } from './test-helpers';
import type { GameState } from './types';

const a = (s: GameState, action: Parameters<typeof apply>[1]) => apply(s, action, catalog);

function treeGame(n = 2): GameState {
  return freshGame(n, undefined, false, undefined, { trees: true });
}

describe('Tiny Trees', () => {
  it('Samen-Phase: jeder setzt einen Samen, dann startet die Runde', () => {
    let s = treeGame();
    expect(s.phase.t).toBe('seedPlacement');
    expect(() => a(s, { t: 'nameResource', resource: 'wood' })).toThrow(RuleError);
    s = a(s, { t: 'placeSeed', player: 0, square: 5 });
    expect(s.phase.t).toBe('seedPlacement');
    expect(() => a(s, { t: 'placeSeed', player: 0, square: 6 })).toThrow(RuleError);
    s = a(s, { t: 'placeSeed', player: 1, square: 10 });
    expect(s.phase.t).toBe('nameResource');
    expect(s.players[0].seedSquare).toBe(5);
  });

  it('Bau auf dem Samen-Feld → Gratis-Material freier Wahl', () => {
    let s = treeGame();
    s = a(s, { t: 'placeSeed', player: 0, square: 0 });
    s = a(s, { t: 'placeSeed', player: 1, square: 0 });
    s = inRound(s);
    for (const p of s.players) p.pending = null;
    res(s, 0, 0, 'wood');
    res(s, 0, 1, 'stone');
    s = a(s, { t: 'build', player: 0, squares: [0, 1], card: 'well', target: 0 });
    expect(s.players[0].seedSquare).toBe(-1);
    expect(s.players[0].choices[0]?.t).toBe('seedBonus');
    s = a(s, { t: 'resolveSeedBonus', player: 0, resource: 'glass', square: 15 });
    expect(s.players[0].board[15].resource).toBe('glass');
  });

  it('Baum: Samen als einziges unbebautes Feld → +2 Punkte, kein Minuspunkt', () => {
    const s = treeGame();
    s.players[0].seedSquare = 0;
    for (let i = 1; i < 16; i++) put(s, 0, i, 'cottage');
    const score = scorePlayer(s, 0, catalog);
    expect(score.treePoints).toBe(2);
    expect(score.emptyPenalty).toBe(0);
  });

  it('kein Baum bei mehreren freien Feldern', () => {
    const s = treeGame();
    s.players[0].seedSquare = 0;
    for (let i = 2; i < 16; i++) put(s, 0, i, 'cottage');
    const score = scorePlayer(s, 0, catalog);
    expect(score.treePoints).toBe(0);
    expect(score.emptyPenalty).toBe(-2);
  });
});
