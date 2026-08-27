// Zugvorschläge für den Lernmodus. Reine Analyse: kein Teil des Regelwerks,
// keine Seiteneffekte — die Engine ruft hier nie auf. Alles baut auf denselben
// Musterfunktionen wie die Bauprüfung, damit ein Vorschlag nie an der Regel
// vorbeigeht (Bahnhof-Strecke, Münzkosten und Co. sind mitgeprüft).

import { buildCell, cachedOrientations } from './patterns';
import { boardSizeOf, rowOf } from './types';
import type { CardDef, Catalog, GameState, PlayerState, Resource, Square } from './types';

/** Eine mögliche Lage eines Baumusters auf dem Brett. */
export interface Placement {
  card: string;
  /** Alle Felder des Musters (schon passende und noch leere). */
  cells: number[];
  /** Schon passend belegte Felder (inkl. Handelsposten als Joker). */
  filled: number;
  /** Noch leere Felder mit dem Material, das dort hingehört. */
  missing: { square: number; resource: Resource }[];
}

export interface PlacementAdvice {
  square: number;
  /** Karte, die mit diesem Feld fertig wird. */
  completes?: string;
  /** Karte, auf die das Feld hinarbeitet. */
  towards?: string;
  /** Belegte von benötigten Musterfeldern (nach dem Platzieren). */
  have: number;
  need: number;
}

export interface BuildAdvice {
  card: string;
  /** Die Felder, die für den Bau markiert werden müssen. */
  squares: number[];
  /** Ein gültiger Bauplatz (Materialfeld des Musters). */
  target: number;
}

/**
 * Grobwert einer Karte für den Vorschlag: Monumente sind einmalig und teuer,
 * Hütten kann man immer noch bauen und müssen erst gefüttert werden.
 */
function value(def: CardDef): number {
  if (def.kind === 'monument') return 3;
  if (def.kind === 'cottage') return 1.5;
  return 2;
}

/** Karten, die dieser Spieler gerade bauen könnte (Auslage + eigenes Monument). */
function candidates(s: GameState, p: PlayerState, catalog: Catalog): string[] {
  const ids = [...s.config.activeCards];
  if (p.monument && !p.monument.built) ids.push(p.monument.card);
  return ids.filter((id) => {
    const def = catalog[id];
    if (!def) return false;
    const effects = def.effects ?? [];
    // Bauverbote, die schon vor dem Muster greifen — sonst schlägt der
    // Lernmodus einen Zug vor, den die Engine ablehnt.
    if (effects.includes('trainStation') && hasStation(p, catalog)) return false;
    if (effects.includes('constructCost2') && p.coins < 2) return false;
    if (s.config.solo && effects.includes('jewelerToll') && p.coins < 1) return false;
    return true;
  });
}

function hasStation(p: PlayerState, catalog: Catalog): boolean {
  return p.board.some(
    (sq) => sq.building && (catalog[sq.building.card]?.effects ?? []).includes('trainStation')
  );
}

/**
 * Alle Musterlagen, die auf dem Brett noch erreichbar sind: jedes Musterfeld
 * ist entweder passend belegt oder noch leer. Bebaute Felder und falsche
 * Materialien schließen eine Lage aus.
 */
export function placements(board: Square[], catalog: Catalog, cards: string[]): Placement[] {
  const out: Placement[] = [];
  const n = boardSizeOf(board);
  for (const card of cards) {
    const def = catalog[card];
    if (!def) continue;
    for (const o of cachedOrientations(card, def.pattern)) {
      const h = o.length, w = o[0].length;
      for (let r = 0; r + h <= n; r++) {
        for (let c = 0; c + w <= n; c++) {
          const found = layAt(o, r, c, board, catalog, card, n);
          if (found) out.push(found);
        }
      }
    }
  }
  return out;
}

function layAt(
  o: (Resource | null)[][], rOff: number, cOff: number,
  board: Square[], catalog: Catalog, card: string, n: number
): Placement | null {
  const cells: number[] = [];
  const missing: { square: number; resource: Resource }[] = [];
  let filled = 0;
  let real = 0; // echte Materialien (Joker allein ergeben keinen Bau)
  for (let r = 0; r < o.length; r++) {
    for (let c = 0; c < o[0].length; c++) {
      const want = o[r][c];
      if (want === null) continue;
      const idx = (rOff + r) * n + (cOff + c);
      const sq = board[idx];
      cells.push(idx);
      if (sq.resource && sq.building) return null; // Bondmaker-Material: nie verbaubar
      const have = buildCell(sq, catalog);
      if (have === '*') {
        filled++;
      } else if (have === want) {
        filled++;
        real++;
      } else if (have === null && !sq.building && !sq.terrain) {
        missing.push({ square: idx, resource: want });
        real++;
      } else {
        return null; // bebaut oder falsches Material
      }
    }
  }
  if (real === 0) return null;
  return { card, cells, filled, missing };
}

/**
 * Wohin gehört das gerade erhaltene Material? Vorgeschlagen wird nur, was ein
 * Muster abschließt oder nachweislich voranbringt — sonst lieber schweigen.
 */
export function suggestPlacement(
  s: GameState, player: number, resource: Resource, catalog: Catalog
): PlacementAdvice | null {
  const p = s.players[player];
  if (!p) return null;
  const all = placements(p.board, catalog, candidates(s, p, catalog));

  // 1. Ein Feld, das ein Muster sofort komplettiert
  let best: Placement | null = null;
  for (const pl of all) {
    if (pl.missing.length !== 1 || pl.missing[0].resource !== resource) continue;
    if (!best || value(catalog[pl.card]) > value(catalog[best.card])) best = pl;
  }
  if (best) {
    return {
      square: best.missing[0].square,
      completes: best.card,
      have: best.cells.length,
      need: best.cells.length
    };
  }

  // 2. Sonst das Feld mit dem größten Fortschritt: jede erreichbare Lage
  //    stimmt mit ihrem Wert ab, fast fertige Muster zählen mehr.
  const score = new Map<number, number>();
  const towards = new Map<number, Placement>();
  for (const pl of all) {
    for (const m of pl.missing) {
      if (m.resource !== resource) continue;
      score.set(m.square, (score.get(m.square) ?? 0) + value(catalog[pl.card]) / pl.missing.length);
      const cur = towards.get(m.square);
      if (
        !cur ||
        pl.missing.length < cur.missing.length ||
        (pl.missing.length === cur.missing.length &&
          value(catalog[pl.card]) > value(catalog[cur.card]))
      ) {
        towards.set(m.square, pl);
      }
    }
  }
  let square = -1, top = 0;
  for (const [sq, sc] of score) {
    if (sc > top) { top = sc; square = sq; }
  }
  if (square < 0) return null;
  const pl = towards.get(square)!;
  return {
    square,
    towards: pl.card,
    have: pl.filled + 1,
    need: pl.cells.length
  };
}

/** Was lässt sich hier und jetzt bauen? Höchster Grobwert gewinnt. */
export function suggestBuild(
  s: GameState, player: number, catalog: Catalog
): BuildAdvice | null {
  const p = s.players[player];
  if (!p) return null;
  const anywhere = p.board.some(
    (sq) => sq.building && (catalog[sq.building.card]?.effects ?? []).includes('buildAnywhereAll')
  );
  let best: { pl: Placement; target: number } | null = null;
  for (const pl of placements(p.board, catalog, candidates(s, p, catalog))) {
    if (pl.missing.length > 0) continue;
    const resourceSquares = pl.cells.filter((i) => p.board[i].resource);
    if (resourceSquares.length === 0) continue;
    const effects = catalog[pl.card].effects ?? [];
    // Bahnhof: der Bauplatz muss in der untersten Reihe liegen (an der Strecke)
    const n = boardSizeOf(p.board);
    const free = effects.includes('buildAnywhereSelf') || anywhere
      ? p.board.map((sq, i) => (!sq.building && !sq.terrain && (!sq.resource || resourceSquares.includes(i)) ? i : -1)).filter((i) => i >= 0)
      : resourceSquares;
    const targets = effects.includes('trainStation')
      ? free.filter((i) => rowOf(i, n) === n - 1)
      : free;
    if (targets.length === 0) continue;
    if (
      !best ||
      value(catalog[pl.card]) > value(catalog[best.pl.card]) ||
      (value(catalog[pl.card]) === value(catalog[best.pl.card]) &&
        pl.cells.length < best.pl.cells.length)
    ) {
      best = { pl, target: targets[0] };
    }
  }
  return best ? { card: best.pl.card, squares: best.pl.cells, target: best.target } : null;
}
