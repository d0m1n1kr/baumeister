// Der Landschafts-Generator trägt die Tages-Challenge der Landpartie:
// gleicher Seed ⇒ überall dasselbe Layout. Die Golden-Seeds unten frieren
// das ein — schlagen sie an, würde ein Release die Tageskarten umschreiben.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from './registry';
import { FALLBACK_TERRAIN, LAND_BOARD_SIZE, generateTerrain } from './terrain';
import type { TerrainCell } from './terrain';
import { idx, neighbors4 } from './types';

const N = LAND_BOARD_SIZE;

function regions(cells: TerrainCell[]): number[][] {
  const blocked = new Set(cells.map((c) => c.square));
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let i = 0; i < N * N; i++) {
    if (blocked.has(i) || seen.has(i)) continue;
    const region: number[] = [];
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const cur = stack.pop()!;
      region.push(cur);
      for (const nb of neighbors4(cur, N)) {
        if (!blocked.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    out.push(region);
  }
  return out;
}

function checkConstraints(cells: TerrainCell[]): void {
  const blocked = new Set(cells.map((c) => c.square));
  // Feldzahl im Band
  expect(cells.length).toBeGreaterThanOrEqual(9);
  expect(cells.length).toBeLessThanOrEqual(13);
  expect(blocked.size).toBe(cells.length); // keine Überlappung
  // Artenzusammensetzung
  const byKind = (k: string) => cells.filter((c) => c.kind === k).length;
  expect(byKind('river')).toBeGreaterThanOrEqual(5);
  expect(byKind('river')).toBeLessThanOrEqual(7);
  expect(byKind('mountain')).toBeGreaterThanOrEqual(2);
  expect(byKind('mountain')).toBeLessThanOrEqual(3);
  expect(byKind('lake')).toBeGreaterThanOrEqual(2);
  expect(byKind('lake')).toBeLessThanOrEqual(3);
  // Keine zu kleinen eingeschlossenen Flächen
  for (const r of regions(cells)) expect(r.length).toBeGreaterThanOrEqual(5);
  // Monument-Fenster (2×4 oder 4×2 komplett frei)
  const freeRect = (r0: number, c0: number, h: number, w: number) => {
    for (let r = r0; r < r0 + h; r++)
      for (let c = c0; c < c0 + w; c++) if (blocked.has(idx(r, c, N))) return false;
    return true;
  };
  let window = false;
  for (const [h, w] of [[2, 4], [4, 2]] as const) {
    for (let r = 0; r + h <= N && !window; r++)
      for (let c = 0; c + w <= N && !window; c++) window = freeRect(r, c, h, w);
  }
  expect(window).toBe(true);
  // Höchstens 2 Ecken belegt
  const corners = [0, N - 1, N * (N - 1), N * N - 1];
  expect(corners.filter((c) => blocked.has(c)).length).toBeLessThanOrEqual(2);
}

describe('generateTerrain', () => {
  it('ist deterministisch: gleicher Seed, gleiches Layout', () => {
    const a = generateTerrain(mulberry32(42));
    const b = generateTerrain(mulberry32(42));
    expect(a).toEqual(b);
  });

  it('hält die Constraints über 500 Seeds', () => {
    let fallbacks = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const cells = generateTerrain(mulberry32(seed));
      if (cells === FALLBACK_TERRAIN) fallbacks++;
      checkConstraints(cells);
    }
    // Das Rückfall-Layout darf existieren, aber nicht der Normalfall sein
    expect(fallbacks).toBe(0);
  });

  it('das Rückfall-Layout erfüllt selbst alle Constraints', () => {
    checkConstraints(FALLBACK_TERRAIN);
  });

  it('Berge und See grenzen nicht an den Fluss (Wertungen bleiben unterscheidbar)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const cells = generateTerrain(mulberry32(seed));
      const river = new Set(cells.filter((c) => c.kind === 'river').map((c) => c.square));
      for (const c of cells) {
        if (c.kind === 'river') continue;
        for (const nb of neighbors4(c.square, N)) expect(river.has(nb)).toBe(false);
      }
    }
  });
});

// Golden-Seeds: exakte Layouts eingefroren (siehe Kopfkommentar). Die Werte
// stammen aus dem ersten Lauf dieser Implementierung — sie zu ändern heißt,
// jede Landpartie-Tageskarte zu ändern.
describe('Golden-Seeds', () => {
  const GOLDEN: Record<number, [number, string][]> = {
    1: [
      [12, 'river'], [13, 'river'], [14, 'river'], [15, 'river'], [16, 'river'], [17, 'river'],
      [1, 'mountain'], [2, 'mountain'],
      [24, 'lake'], [30, 'lake']
    ],
    4711: [
      [4, 'river'], [10, 'river'], [9, 'river'], [15, 'river'], [21, 'river'], [27, 'river'], [33, 'river'],
      [30, 'mountain'], [24, 'mountain'],
      [23, 'lake'], [29, 'lake']
    ],
    20260827: [
      [6, 'river'], [0, 'river'], [1, 'river'], [2, 'river'], [3, 'river'], [4, 'river'], [5, 'river'],
      [26, 'mountain'], [27, 'mountain'], [33, 'mountain'],
      [15, 'lake'], [16, 'lake']
    ]
  };

  for (const [seed, want] of Object.entries(GOLDEN)) {
    it(`Layout von Seed ${seed} ist eingefroren`, () => {
      const got = generateTerrain(mulberry32(Number(seed))).map((c) => [c.square, c.kind]);
      expect(got).toEqual(want);
    });
  }
});
