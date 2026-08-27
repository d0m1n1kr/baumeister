// Baumuster-Matching: Rotation + Spiegelung erlaubt, Handelsposten als Wild-Zelle.

import type { Pattern, PatternCell, Resource, Square, Catalog } from './types';
import { dimsOf, rowOf, colOf } from './types';

function rotate(p: Pattern): Pattern {
  const rows = p.length, cols = p[0].length;
  const out: PatternCell[][] = [];
  for (let c = 0; c < cols; c++) {
    const row: PatternCell[] = [];
    for (let r = rows - 1; r >= 0; r--) row.push(p[r][c]);
    out.push(row);
  }
  return out;
}

function mirror(p: Pattern): Pattern {
  return p.map((row) => [...row].reverse());
}

function key(p: Pattern): string {
  return p.map((row) => row.map((c) => c ?? '.').join('')).join('|');
}

/** Alle eindeutigen Orientierungen (≤8) eines Musters. */
export function orientations(p: Pattern): Pattern[] {
  const seen = new Map<string, Pattern>();
  let cur = p;
  for (let m = 0; m < 2; m++) {
    for (let r = 0; r < 4; r++) {
      seen.set(key(cur), cur);
      cur = rotate(cur);
    }
    cur = mirror(cur);
  }
  return [...seen.values()];
}

const orientationCache = new Map<string, Pattern[]>();
export function cachedOrientations(cardId: string, p: Pattern): Pattern[] {
  let o = orientationCache.get(cardId);
  if (!o) {
    o = orientations(p);
    orientationCache.set(cardId, o);
  }
  return o;
}

export interface MatchInput {
  board: Square[];
  squares: number[]; // ausgewählte Felder
  catalog: Catalog;
}

/**
 * Liefert das effektive Material eines Feldes für den Bau:
 * echtes Material oder '*' für einen Handelsposten (Wild), sonst null.
 */
export function buildCell(sq: Square, catalog: Catalog): Resource | '*' | null {
  if (sq.resource) return sq.resource; // Bondmaker-Material auf Hütte ist NIE verbaubar → unten geprüft
  if (sq.building && catalog[sq.building.card]?.effects?.includes('tradingPost')) return '*';
  return null;
}

/**
 * Prüft, ob die ausgewählten Felder exakt das Muster (in irgendeiner
 * Orientierung) ergeben. Bondmaker-Materialien (Material auf bebautem Feld)
 * sind nicht verbaubar; mindestens 1 echtes Material ist Pflicht.
 */
export function matchesPattern(cardId: string, input: MatchInput): boolean {
  const { board, squares, catalog } = input;
  const def = catalog[cardId];
  if (!def || squares.length === 0) return false;

  // Zellen einsammeln + Regeln prüfen
  let realResources = 0;
  const cells = new Map<number, Resource | '*'>();
  for (const s of squares) {
    const sq = board[s];
    if (sq.resource && sq.building) return false; // Bondmaker-Material: nie verbaubar
    const c = buildCell(sq, catalog);
    if (!c) return false;
    if (c !== '*') realResources++;
    cells.set(s, c);
  }
  if (realResources === 0) return false;

  // Bounding-Box der Auswahl (Maße des KONKRETEN Bretts — Landpartie: 5×6)
  const { cols, rows } = dimsOf(board);
  let rMin = rows, rMax = -1, cMin = cols, cMax = -1;
  for (const s of squares) {
    rMin = Math.min(rMin, rowOf(s, cols)); rMax = Math.max(rMax, rowOf(s, cols));
    cMin = Math.min(cMin, colOf(s, cols)); cMax = Math.max(cMax, colOf(s, cols));
  }
  const h = rMax - rMin + 1, w = cMax - cMin + 1;

  for (const o of cachedOrientations(cardId, def.pattern)) {
    if (o.length !== h || o[0].length !== w) continue;
    if (matchOrientation(o, rMin, cMin, cells, cols)) return true;
  }
  return false;
}

function matchOrientation(
  o: Pattern,
  rMin: number,
  cMin: number,
  cells: Map<number, Resource | '*'>,
  cols: number
): boolean {
  let used = 0;
  for (let r = 0; r < o.length; r++) {
    for (let c = 0; c < o[0].length; c++) {
      const want = o[r][c];
      const have = cells.get((rMin + r) * cols + (cMin + c));
      if (want === null) {
        if (have !== undefined) return false; // Auswahl enthält Feld außerhalb des Musters
      } else {
        if (have === undefined) return false;
        if (have !== '*' && have !== want) return false;
        used++;
      }
    }
  }
  return used === cells.size;
}

/**
 * Findet alle Karten des Katalogs (aus einer Kandidatenliste),
 * deren Muster die Auswahl exakt erfüllt.
 */
export function matchingCards(candidates: string[], input: MatchInput): string[] {
  return candidates.filter((id) => matchesPattern(id, input));
}

/**
 * Existiert irgendwo auf dem Brett eine baubare Auswahl für diese Karte?
 * (Für die Spielende-/„Stadt fertig"-Prüfung.)
 */
export function anyPlacementPossible(cardId: string, board: Square[], catalog: Catalog): boolean {
  const def = catalog[cardId];
  if (!def) return false;
  const { cols, rows } = dimsOf(board);
  for (const o of cachedOrientations(cardId, def.pattern)) {
    const h = o.length, w = o[0].length;
    for (let r = 0; r + h <= rows; r++) {
      for (let c = 0; c + w <= cols; c++) {
        if (fitsAt(o, r, c, board, catalog, cols)) return true;
      }
    }
  }
  return false;
}

function fitsAt(
  o: Pattern, rOff: number, cOff: number, board: Square[], catalog: Catalog, cols: number
): boolean {
  let real = 0;
  for (let r = 0; r < o.length; r++) {
    for (let c = 0; c < o[0].length; c++) {
      const want = o[r][c];
      if (want === null) continue;
      const sq = board[(rOff + r) * cols + (cOff + c)];
      if (sq.resource && sq.building) return false;
      const have = buildCell(sq, catalog);
      if (!have) return false;
      if (have !== '*') {
        if (have !== want) return false;
        real++;
      }
    }
  }
  return real > 0;
}
