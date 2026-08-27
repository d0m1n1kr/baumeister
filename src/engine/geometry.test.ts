// Die Geometrie-Helfer sind seit der Landpartie parametrisch: Default bleibt
// das klassische 4×4 (bestehende Aufrufer unverändert), mit n=6 rechnen sie
// auf dem großen Brett. Diese Tests halten beide Welten fest.
import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE, boardSizeOf, centerSquares, colOf, cornerSquares,
  idx, isBlocked, isFreeSquare, neighbors4, neighbors8, rowOf
} from './types';

describe('Geometrie mit Default (klassisch 4×4)', () => {
  it('idx/rowOf/colOf wie bisher', () => {
    expect(idx(3, 3)).toBe(15);
    expect(rowOf(15)).toBe(3);
    expect(colOf(14)).toBe(2);
  });

  it('Ecken und Mitte wie die alten Konstanten', () => {
    expect(cornerSquares()).toEqual([0, 3, 12, 15]);
    expect(centerSquares()).toEqual([5, 6, 9, 10]);
  });
});

describe('Geometrie bei n=6 (Landpartie)', () => {
  it('Index-Umrechnung', () => {
    expect(idx(5, 5, 6)).toBe(35);
    expect(rowOf(35, 6)).toBe(5);
    expect(colOf(35, 6)).toBe(5);
    expect(rowOf(6, 6)).toBe(1);
  });

  it('Nachbarn klemmen an den echten Rändern, nicht bei Spalte 4', () => {
    // Feld 4 liegt bei n=6 mitten in Zeile 0 — bei n=4 wäre es Zeilenanfang
    expect(neighbors4(4, 6).sort((a, b) => a - b)).toEqual([3, 5, 10]);
    expect(neighbors4(0, 6).sort((a, b) => a - b)).toEqual([1, 6]);
    expect(neighbors8(35, 6).sort((a, b) => a - b)).toEqual([28, 29, 34]);
    expect(neighbors4(14, 6)).toHaveLength(4); // mittig: alle vier
  });

  it('Ecken und Mitte des 6×6', () => {
    expect(cornerSquares(6)).toEqual([0, 5, 30, 35]);
    expect(centerSquares(6)).toEqual([14, 15, 20, 21]);
  });

  it('boardSizeOf liest die Größe aus dem Brett selbst', () => {
    expect(boardSizeOf(Array.from({ length: 16 }))).toBe(4);
    expect(boardSizeOf(Array.from({ length: 36 }))).toBe(6);
  });
});

describe('freie und gesperrte Felder', () => {
  it('Landschaft ist gesperrt und nie frei', () => {
    expect(isBlocked({ terrain: 'river' })).toBe(true);
    expect(isBlocked({})).toBe(false);
    expect(isFreeSquare({})).toBe(true);
    expect(isFreeSquare({ terrain: 'lake' })).toBe(false);
    expect(isFreeSquare({ resource: 'wood' })).toBe(false);
    expect(isFreeSquare({ building: { card: 'cottage' } })).toBe(false);
  });
});

describe('newGame mit Landpartie-Flag', () => {
  it('legt ein 36-Felder-Brett an, klassisch bleibt 16', async () => {
    const { newGame } = await import('./game');
    const base = {
      players: [{ name: 'A', corner: 0 }],
      activeCards: [], monumentDeals: [[]], firstMasterBuilder: 0,
      useMonuments: false, solo: true, sets: ['base'],
      systems: { coins: false, trees: false, cavern: false, train: false }
    };
    expect(newGame(base as never).players[0].board).toHaveLength(16);
    expect(newGame({ ...base, land: true } as never).players[0].board).toHaveLength(36);
  });
});
