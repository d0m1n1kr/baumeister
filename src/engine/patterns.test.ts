import { describe, it, expect } from 'vitest';
import { orientations, matchesPattern, anyPlacementPossible } from './patterns';
import { catalog, freshGame, res, put } from './test-helpers';
import { idx } from './types';

describe('orientations', () => {
  it('erzeugt für asymmetrische Muster 8 Varianten', () => {
    // Hütte: [[null,H],[B,G]] — asymmetrisch
    expect(orientations(catalog['cottage'].pattern).length).toBe(8);
  });

  it('dedupliziert symmetrische Muster', () => {
    // Brunnen: [[W,S]] — 1×2, Rotation+Spiegelung ergeben 4 eindeutige
    expect(orientations(catalog['well'].pattern).length).toBe(4);
  });
});

describe('matchesPattern', () => {
  it('erkennt das Hütten-Muster in Originalausrichtung', () => {
    const s = freshGame();
    // Muster [[_,H],[B,G]]: H auf (0,1), B auf (1,0), G auf (1,1)
    res(s, 0, idx(0, 1), 'wheat');
    res(s, 0, idx(1, 0), 'brick');
    res(s, 0, idx(1, 1), 'glass');
    const squares = [idx(0, 1), idx(1, 0), idx(1, 1)];
    expect(matchesPattern('cottage', { board: s.players[0].board, squares, catalog })).toBe(true);
  });

  it('erkennt rotierte und gespiegelte Muster', () => {
    const s = freshGame();
    // 180°-Rotation von [[_,H],[B,G]] ist [[G,B],[H,_]]
    res(s, 0, idx(2, 2), 'glass');
    res(s, 0, idx(2, 3), 'brick');
    res(s, 0, idx(3, 2), 'wheat');
    const squares = [idx(2, 2), idx(2, 3), idx(3, 2)];
    expect(matchesPattern('cottage', { board: s.players[0].board, squares, catalog })).toBe(true);
  });

  it('lehnt falsche Materialien ab', () => {
    const s = freshGame();
    res(s, 0, idx(0, 1), 'wood'); // statt wheat
    res(s, 0, idx(1, 0), 'brick');
    res(s, 0, idx(1, 1), 'glass');
    const squares = [idx(0, 1), idx(1, 0), idx(1, 1)];
    expect(matchesPattern('cottage', { board: s.players[0].board, squares, catalog })).toBe(false);
  });

  it('lehnt unzusammenhängende Auswahl ab, die nicht zum Muster passt', () => {
    const s = freshGame();
    res(s, 0, idx(0, 0), 'wood');
    res(s, 0, idx(3, 3), 'stone');
    expect(
      matchesPattern('well', { board: s.players[0].board, squares: [idx(0, 0), idx(3, 3)], catalog })
    ).toBe(false);
  });

  it('Handelsposten zählt als Wild-Material', () => {
    const s = freshGame();
    put(s, 0, idx(1, 0), 'trading_post'); // ersetzt brick
    res(s, 0, idx(0, 1), 'wheat');
    res(s, 0, idx(1, 1), 'glass');
    const squares = [idx(0, 1), idx(1, 0), idx(1, 1)];
    expect(matchesPattern('cottage', { board: s.players[0].board, squares, catalog })).toBe(true);
  });

  it('mindestens 1 echtes Material ist Pflicht (nur Handelsposten reicht nicht)', () => {
    const s = freshGame();
    put(s, 0, idx(0, 0), 'trading_post');
    put(s, 0, idx(0, 1), 'trading_post');
    expect(
      matchesPattern('well', { board: s.players[0].board, squares: [idx(0, 0), idx(0, 1)], catalog })
    ).toBe(false);
  });

  it('Bondmaker-Material (auf Gebäude) ist nie verbaubar', () => {
    const s = freshGame();
    put(s, 0, idx(0, 0), 'cottage');
    s.players[0].board[idx(0, 0)].resource = 'wood';
    res(s, 0, idx(0, 1), 'stone');
    expect(
      matchesPattern('well', { board: s.players[0].board, squares: [idx(0, 0), idx(0, 1)], catalog })
    ).toBe(false);
  });
});

describe('anyPlacementPossible', () => {
  it('findet baubares Muster irgendwo auf dem Brett', () => {
    const s = freshGame();
    res(s, 0, idx(2, 1), 'wood');
    res(s, 0, idx(2, 2), 'stone');
    expect(anyPlacementPossible('well', s.players[0].board, catalog)).toBe(true);
    expect(anyPlacementPossible('cottage', s.players[0].board, catalog)).toBe(false);
  });

  it('leeres Brett: nichts baubar', () => {
    const s = freshGame();
    expect(anyPlacementPossible('well', s.players[0].board, catalog)).toBe(false);
  });
});
