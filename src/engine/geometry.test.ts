// Die Geometrie-Helfer sind seit der Landpartie parametrisch: Default bleibt
// das klassische 4×4 (bestehende Aufrufer unverändert), mit n=6 rechnen sie
// auf dem großen Brett. Diese Tests halten beide Welten fest.
import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE, LAND_COLS, LAND_ROWS, centerSquares, colOf, cornerSquares, dimsOf,
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

// Das Landpartie-Brett ist NICHT quadratisch: 5 breit, 6 hoch. Genau da liegt
// die Falle — wer Zeilen und Spalten verwechselt, bekommt Nachbarn, die über
// den Rand hinweg „umbrechen", und damit stillschweigend falsche Punkte.
describe('Geometrie bei 5×6 (Landpartie)', () => {
  const C = LAND_COLS, R = LAND_ROWS;

  it('Index-Umrechnung über die Spaltenzahl', () => {
    expect(C).toBe(5);
    expect(R).toBe(6);
    expect(idx(5, 4, C)).toBe(29); // letztes Feld
    expect(rowOf(29, C)).toBe(5);
    expect(colOf(29, C)).toBe(4);
    expect(rowOf(5, C)).toBe(1); // Zeilenwechsel nach 5, nicht nach 4 oder 6
  });

  it('Nachbarn brechen nicht über den rechten Rand um', () => {
    // Feld 4 ist das RECHTE Ende von Zeile 0 — Feld 5 beginnt Zeile 1
    expect(neighbors4(4, C, R).sort((a, b) => a - b)).toEqual([3, 9]);
    expect(neighbors4(0, C, R).sort((a, b) => a - b)).toEqual([1, 5]);
    // unten rechts: nur zwei orthogonale Nachbarn
    expect(neighbors4(29, C, R).sort((a, b) => a - b)).toEqual([24, 28]);
    expect(neighbors8(29, C, R).sort((a, b) => a - b)).toEqual([23, 24, 28]);
    expect(neighbors4(12, C, R)).toHaveLength(4); // mittig: alle vier
  });

  it('Ecken und Mitte des 5×6', () => {
    expect(cornerSquares(C, R)).toEqual([0, 4, 25, 29]);
    // 5 Spalten sind ungerade: die Mitte liegt auf Spalte 2, also 2 Felder
    expect(centerSquares(C, R)).toEqual([12, 17]);
  });

  it('dimsOf liest die Maße aus dem Brett selbst', () => {
    expect(dimsOf(Array.from({ length: 16 }))).toEqual({ cols: 4, rows: 4 });
    expect(dimsOf(Array.from({ length: 30 }))).toEqual({ cols: 5, rows: 6 });
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
  it('legt ein 30-Felder-Brett an, klassisch bleibt 16', async () => {
    const { newGame } = await import('./game');
    const base = {
      players: [{ name: 'A', corner: 0 }],
      activeCards: [], monumentDeals: [[]], firstMasterBuilder: 0,
      useMonuments: false, solo: true, sets: ['base'],
      systems: { coins: false, trees: false, cavern: false, train: false }
    };
    expect(newGame(base as never).players[0].board).toHaveLength(16);
    expect(newGame({ ...base, land: true } as never).players[0].board).toHaveLength(30);
  });
});
