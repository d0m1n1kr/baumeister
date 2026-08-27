// Der Landschafts-Generator trägt die Tages-Challenge der Landpartie:
// gleicher Seed ⇒ überall dasselbe Layout. Die Golden-Seeds unten frieren
// das ein — schlagen sie an, würde ein Release die Tageskarten umschreiben.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from './registry';
import { FALLBACK_TERRAIN, generateTerrain } from './terrain';
import type { TerrainCell } from './terrain';
import { LAND_COLS, LAND_ROWS, idx, neighbors4 } from './types';

// 5 breit, 6 hoch — nicht quadratisch, also überall getrennt rechnen
const C = LAND_COLS;
const R = LAND_ROWS;
const FELDER = C * R;

function regions(cells: TerrainCell[]): number[][] {
  const blocked = new Set(cells.map((c) => c.square));
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let i = 0; i < FELDER; i++) {
    if (blocked.has(i) || seen.has(i)) continue;
    const region: number[] = [];
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const cur = stack.pop()!;
      region.push(cur);
      for (const nb of neighbors4(cur, C, R)) {
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

/**
 * Passt der Bahnhof? Sein Muster ist 1×3 und drehbar, das Gebäude selbst muss
 * in der untersten Reihe liegen: drei freie Felder nebeneinander in der
 * letzten Reihe, oder drei übereinander mit dem untersten in der letzten.
 * Bewusst hier nachgerechnet statt aus dem Modul geholt — sonst prüfte der
 * Test die Regel gegen sich selbst.
 */
function bahnhofPasst(blocked: Set<number>): boolean {
  const frei = (r: number, c: number) => !blocked.has(idx(r, c, C));
  for (let c = 0; c + 3 <= C; c++) {
    if (frei(R - 1, c) && frei(R - 1, c + 1) && frei(R - 1, c + 2)) return true;
  }
  for (let c = 0; c < C; c++) {
    if (frei(R - 1, c) && frei(R - 2, c) && frei(R - 3, c)) return true;
  }
  return false;
}

function checkConstraints(cells: TerrainCell[]): void {
  const blocked = new Set(cells.map((c) => c.square));
  // Feldzahl im Band — und damit die bebaubare Fläche: etwas mehr als die
  // klassischen 16 Felder, aber nicht so viel, dass eine Partie zäh wird
  expect(cells.length).toBeGreaterThanOrEqual(9);
  expect(cells.length).toBeLessThanOrEqual(13);
  expect(FELDER - cells.length).toBeGreaterThanOrEqual(17);
  expect(FELDER - cells.length).toBeLessThanOrEqual(21);
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
      for (let c = c0; c < c0 + w; c++) if (blocked.has(idx(r, c, C))) return false;
    return true;
  };
  let window = false;
  for (const [h, w] of [[2, 4], [4, 2]] as const) {
    for (let r = 0; r + h <= R && !window; r++)
      for (let c = 0; c + w <= C && !window; c++) window = freeRect(r, c, h, w);
  }
  expect(window).toBe(true);
  // Höchstens 2 Ecken belegt
  const corners = [0, C - 1, C * (R - 1), FELDER - 1];
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
        for (const nb of neighbors4(c.square, C, R)) expect(river.has(nb)).toBe(false);
      }
    }
  });

  it('Eisenbahn: die unterste Reihe trägt den Bahnhof', () => {
    // Der Bahnhof (Muster 1×3, drehbar) muss in der untersten Reihe gebaut
    // werden. Mit `track` garantiert der Generator dafür einen Platz.
    for (let seed = 1; seed <= 300; seed++) {
      const blocked = new Set(
        generateTerrain(mulberry32(seed), C, R, { track: true }).map((c) => c.square)
      );
      expect(bahnhofPasst(blocked)).toBe(true);
    }
  });

  it('ohne die Option gibt es Layouts ohne Bahnhofsplatz (die Prüfung greift also)', () => {
    let ohnePlatz = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const blocked = new Set(generateTerrain(mulberry32(seed)).map((c) => c.square));
      if (!bahnhofPasst(blocked)) ohnePlatz++;
    }
    expect(ohnePlatz).toBeGreaterThan(0);
  });

  it('Eisenbahn-Layouts erfüllen weiterhin alle übrigen Constraints', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const cells = generateTerrain(mulberry32(seed), C, R, { track: true });
      expect(cells).not.toBe(FALLBACK_TERRAIN);
      checkConstraints(cells);
    }
  });

  it('das Rückfall-Layout trägt auch den Bahnhof', () => {
    expect(bahnhofPasst(new Set(FALLBACK_TERRAIN.map((c) => c.square)))).toBe(true);
  });
});

// Golden-Seeds: exakte Layouts eingefroren (siehe Kopfkommentar). Sie zu
// ändern heißt, jede Landpartie-Tageskarte zu ändern. Zuletzt bewusst neu
// gesetzt beim Wechsel von 6×6 auf 5×6 — eine andere Brettform hat zwangsläufig
// andere Layouts. Ab hier gilt: nicht mehr ohne Grund anfassen.
describe('Golden-Seeds', () => {
  const GOLDEN: Record<number, [number, string][]> = {
    1: [
      [0, 'river'], [5, 'river'], [10, 'river'], [15, 'river'], [20, 'river'], [25, 'river'],
      [24, 'mountain'], [19, 'mountain'],
      [7, 'lake'], [2, 'lake']
    ],
    4711: [
      [3, 'river'], [8, 'river'], [7, 'river'], [12, 'river'], [17, 'river'], [22, 'river'], [27, 'river'],
      [25, 'mountain'], [20, 'mountain'],
      [24, 'lake'], [29, 'lake']
    ],
    20260827: [
      [15, 'river'], [10, 'river'], [11, 'river'], [12, 'river'], [17, 'river'], [18, 'river'], [19, 'river'],
      [9, 'mountain'], [4, 'mountain'],
      [28, 'lake'], [27, 'lake']
    ]
  };

  for (const [seed, want] of Object.entries(GOLDEN)) {
    it(`Layout von Seed ${seed} ist eingefroren`, () => {
      const got = generateTerrain(mulberry32(Number(seed))).map((c) => [c.square, c.kind]);
      expect(got).toEqual(want);
    });
  }
});
