// Landschaft der Landpartie: Fluss, Berge und See auf dem 5×6-Brett
// (5 breit, 6 hoch — hochkant wie ein Telefon in der Hand).
//
// Der Generator ist PUR und zieht ausschließlich aus dem übergebenen RNG —
// gleicher Seed ⇒ gleiches Layout, auf jedem Gerät. Das trägt die
// Tages-Challenge; der Golden-Test in terrain.test.ts friert konkrete Seeds
// ein, damit kein späteres Refactoring die Tageskarten stillschweigend
// umschreibt. Wer hier die Zugreihenfolge des RNGs ändert, ändert jede
// künftige UND jede vergangene Tageskarte — deshalb schlagen dann Tests an.
//
// Die Form entsteht durch Verwerfen: würfeln, prüfen, notfalls neu. Alle
// Versuche ziehen aus demselben RNG, die Schleife ist damit deterministisch.

import type { Rng } from './registry';
import type { TerrainKind } from './types';
import { LAND_COLS, LAND_ROWS, idx, neighbors4 } from './types';

export interface TerrainCell {
  square: number;
  kind: TerrainKind;
}

/** Kleinste erlaubte zusammenhängende bebaubare Fläche. */
const MIN_REGION = 5;
/** Der Fluss muss queren (kürzeste Querung: 5 Felder) und darf nicht mäandern. */
const MIN_RIVER = 5;
const MAX_RIVER = 7;
// 300 statt 100: Bei 100 traf 1 von 500 Seeds den Fallback (Seed 363) —
// der Fluss-Walk kann sich festlaufen und verbraucht dann Versuche.
const MAX_ATTEMPTS = 300;

const pick = <T>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

/** Fluss: orthogonaler Pfad von einer zufälligen Kante zur gegenüberliegenden. */
function riverWalk(rng: Rng, cols: number, rows: number): number[] | null {
  const vertical = rng() < 0.5; // von oben nach unten oder von links nach rechts
  const start = Math.floor(rng() * (vertical ? cols : rows));
  let r = vertical ? 0 : start;
  let c = vertical ? start : 0;
  const path = [idx(r, c, cols)];
  const onPath = new Set(path);
  // Vorwärts mit gelegentlichem Seitwärtsschritt, bis die Gegenkante erreicht ist
  for (let guard = 0; guard < 40; guard++) {
    if (vertical ? r === rows - 1 : c === cols - 1) return path;
    const options: [number, number][] = [];
    // vorwärts doppelt gewichtet: der Fluss soll queren, nicht mäandern
    options.push(vertical ? [r + 1, c] : [r, c + 1]);
    options.push(vertical ? [r + 1, c] : [r, c + 1]);
    if (vertical ? c > 0 : r > 0) options.push(vertical ? [r, c - 1] : [r - 1, c]);
    if (vertical ? c < cols - 1 : r < rows - 1) options.push(vertical ? [r, c + 1] : [r + 1, c]);
    const [nr, nc] = pick(rng, options);
    const ni = idx(nr, nc, cols);
    if (onPath.has(ni)) continue; // nicht zurück auf den eigenen Lauf
    r = nr;
    c = nc;
    path.push(ni);
    onPath.add(ni);
    if (path.length > MAX_RIVER) return null; // zu lang geworden — verwerfen
  }
  return null;
}

/** Cluster/Blob: 2–3 orthogonal zusammenhängende Felder abseits der Sperrliste. */
function blob(
  rng: Rng, cols: number, rows: number, taken: Set<number>, count: number
): number[] | null {
  const free: number[] = [];
  for (let i = 0; i < cols * rows; i++) if (!taken.has(i)) free.push(i);
  if (free.length === 0) return null;
  const cells = [pick(rng, free)];
  while (cells.length < count) {
    const around = neighbors4(pick(rng, cells), cols, rows).filter(
      (i) => !taken.has(i) && !cells.includes(i)
    );
    if (around.length === 0) return null;
    cells.push(pick(rng, around));
  }
  return cells;
}

/** Zusammenhängende bebaubare Regionen (orthogonal). */
function regions(blockedSet: Set<number>, cols: number, rows: number): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let i = 0; i < cols * rows; i++) {
    if (blockedSet.has(i) || seen.has(i)) continue;
    const region: number[] = [];
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const cur = stack.pop()!;
      region.push(cur);
      for (const nb of neighbors4(cur, cols, rows)) {
        if (!blockedSet.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    out.push(region);
  }
  return out;
}

/** Gibt es ein komplett bebaubares 2×4- oder 4×2-Fenster? (Schloss Barrett) */
function hasMonumentWindow(blockedSet: Set<number>, cols: number, rows: number): boolean {
  const freeRect = (r0: number, c0: number, h: number, w: number): boolean => {
    for (let r = r0; r < r0 + h; r++)
      for (let c = c0; c < c0 + w; c++) if (blockedSet.has(idx(r, c, cols))) return false;
    return true;
  };
  for (const [h, w] of [
    [2, 4],
    [4, 2]
  ]) {
    for (let r = 0; r + h <= rows; r++)
      for (let c = 0; c + w <= cols; c++) if (freeRect(r, c, h, w)) return true;
  }
  return false;
}

function isValid(cells: TerrainCell[], cols: number, rows: number): boolean {
  const blockedSet = new Set(cells.map((c) => c.square));
  // Keine zu kleinen eingeschlossenen Flächen
  if (regions(blockedSet, cols, rows).some((r) => r.length < MIN_REGION)) return false;
  // Das größte Basis-Monument muss baubar bleiben
  if (!hasMonumentWindow(blockedSet, cols, rows)) return false;
  // Höchstens 2 Ecken belegt (Kloster bleibt spielbar)
  const corners = [
    idx(0, 0, cols), idx(0, cols - 1, cols),
    idx(rows - 1, 0, cols), idx(rows - 1, cols - 1, cols)
  ];
  if (corners.filter((c) => blockedSet.has(c)).length > 2) return false;
  return true;
}

/**
 * Handgeprüftes Rückfall-Layout, falls alle Versuche scheitern (praktisch
 * unerreichbar — der Test misst die Trefferquote). Auf dem 5×6-Brett: Fluss
 * quer durch Zeile 2, Berge in der linken Spalte unten, See oben rechts.
 */
export const FALLBACK_TERRAIN: TerrainCell[] = [
  { square: 10, kind: 'river' },
  { square: 11, kind: 'river' },
  { square: 12, kind: 'river' },
  { square: 13, kind: 'river' },
  { square: 14, kind: 'river' },
  { square: 20, kind: 'mountain' },
  { square: 25, kind: 'mountain' },
  { square: 3, kind: 'lake' },
  { square: 4, kind: 'lake' }
];

/**
 * Erzeugt die Landschaft eines Landpartie-Bretts: ein Fluss von Kante zu
 * Kante (5–7 Felder), ein Bergzug (2–3), ein See (2–3) — zusammen 9–13
 * Felder. Von 30 Feldern bleiben damit 17–21 bebaubare: etwas mehr als die
 * klassischen 16, aber nicht so viel, dass eine Partie zäh wird.
 */
export function generateTerrain(
  rng: Rng, cols = LAND_COLS, rows = LAND_ROWS
): TerrainCell[] {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const river = riverWalk(rng, cols, rows);
    if (!river || river.length < MIN_RIVER) continue;
    const taken = new Set(river);
    // Berge und See nicht direkt ans Wasser: eine Reihe Abstand hält die
    // Anlieger-Wertungen unterscheidbar (Mine am Berg ≠ Mine am Fluss)
    const nearRiver = new Set(river.flatMap((i) => neighbors4(i, cols, rows)));
    const offLimits = new Set([...taken, ...nearRiver]);
    const mountains = blob(rng, cols, rows, offLimits, 2 + Math.floor(rng() * 2));
    if (!mountains) continue;
    mountains.forEach((i) => {
      offLimits.add(i);
      for (const nb of neighbors4(i, cols, rows)) offLimits.add(nb);
    });
    const lake = blob(rng, cols, rows, offLimits, 2 + Math.floor(rng() * 2));
    if (!lake) continue;
    const cells: TerrainCell[] = [
      ...river.map((square) => ({ square, kind: 'river' as const })),
      ...mountains.map((square) => ({ square, kind: 'mountain' as const })),
      ...lake.map((square) => ({ square, kind: 'lake' as const }))
    ];
    if (isValid(cells, cols, rows)) return cells;
  }
  return FALLBACK_TERRAIN;
}
