// Endwertung: Fütterungs-Resolver (optimal) + deklarativer Wertungs-Interpreter.

import type {
  Catalog, CardDef, GameState, PlayerState, PlayerScore, ScoreLine, Selector
} from './types';
import {
  NUM_SQUARES, centerSquares, cornerSquares, dimsOf,
  neighbors4, neighbors8, rowOf, colOf
} from './types';

interface Placed {
  square: number;
  card: string;
  def: CardDef;
}

function placedBuildings(p: PlayerState, catalog: Catalog): Placed[] {
  const out: Placed[] = [];
  p.board.forEach((sq, i) => {
    if (sq.building) out.push({ square: i, card: sq.building.card, def: catalog[sq.building.card] });
  });
  return out;
}

/** Hütten-artig: Kategorie cottage oder Barrett Castle. */
function isCottage(def: CardDef): boolean {
  return def.category === 'cottage' || (def.effects ?? []).includes('barrettCastle');
}

/** Fütterbar: Hütten-artig oder Monument mit Futter-Symbol (Eraflage Vineyard).
 *  Solche Monumente werden wie Hütten gefüttert, zählen aber für keine
 *  Hütten-Wertung (Brunnen, Pfarrhaus, …). */
function isFeedable(def: CardDef): boolean {
  return isCottage(def) || (def.effects ?? []).includes('fedMonument');
}

/** Barrett Castle zählt für alle Wertungen als 2 Hütten. */
function cottageWeight(def: CardDef): number {
  return (def.effects ?? []).includes('barrettCastle') ? 2 : 1;
}

function matchesSelector(sel: Selector, target: CardDef, self: CardDef, fed: Set<number>, square: number): boolean {
  if (sel === 'cottage') return isCottage(target);
  if (sel === 'fedCottage') return isCottage(target) && fed.has(square);
  if (sel === 'self') return target.color === self.color;
  if ('color' in sel) return target.color === sel.color;
  return target.id === sel.card;
}

/** Gewicht eines Treffers (Hütten-Selektoren zählen Barrett doppelt). */
function selectorWeight(sel: Selector, target: CardDef): number {
  if (sel === 'cottage' || sel === 'fedCottage') return cottageWeight(target);
  return 1;
}

// ---------- Fütterung ----------

/** Zusammenhängende Gruppen fütterbarer Gebäude (orthogonal). */
function cottageGroups(buildings: Placed[], cols: number, rows: number): number[][] {
  const cottageSquares = new Set(buildings.filter((b) => isFeedable(b.def)).map((b) => b.square));
  const seen = new Set<number>();
  const groups: number[][] = [];
  for (const s of cottageSquares) {
    if (seen.has(s)) continue;
    const group: number[] = [];
    const stack = [s];
    seen.add(s);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const n of neighbors4(cur, cols, rows)) {
        if (cottageSquares.has(n) && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k >= arr.length) return [arr];
  if (k <= 0) return [[]];
  const out: T[][] = [];
  const pick = (start: number, cur: T[]) => {
    if (cur.length === k) { out.push([...cur]); return; }
    for (let i = start; i <= arr.length - (k - cur.length); i++) {
      cur.push(arr[i]);
      pick(i + 1, cur);
      cur.pop();
    }
  };
  pick(0, []);
  return out;
}

interface FeedCandidate {
  fed: Set<number>;
  coinsSpent: number;
}

/**
 * Alle sinnvollen Fütterungs-Kandidaten (Mengen gefütterter Hütten-Felder,
 * ggf. mit ausgegebenen Münzen — Fortune). Deterministische Fütterer
 * (Kornspeicher/Obstgarten/Zehntscheune-Nachbarn) stehen fest; pro Gewächshaus
 * wird eine zusammenhängende Gruppe gewählt; Bauernhöfe füttern beliebige
 * Hütten bis zur Kapazität; Root Cellar/Tithe Barn füttern gegen Münzen.
 */
function feedingCandidates(p: PlayerState, catalog: Catalog): FeedCandidate[] {
  const { cols, rows } = dimsOf(p.board);
  const buildings = placedBuildings(p, catalog);
  const cottages = buildings.filter((b) => isFeedable(b.def)).map((b) => b.square);
  if (cottages.length === 0) return [{ fed: new Set(), coinsSpent: 0 }];

  const fixed = new Set<number>();
  let anywhereCapacity = 0;
  let greenhouses = 0;
  let hasRowColPerCoin = false;
  let hasPerCoinPer2 = false;

  for (const b of buildings) {
    const feeding = b.def.feeding;
    if (!feeding) continue;
    switch (feeding.mode) {
      case 'anywhere':
        anywhereCapacity += feeding.count ?? 0;
        break;
      case 'surrounding8':
        for (const n of neighbors8(b.square, cols, rows)) if (cottages.includes(n)) fixed.add(n);
        break;
      case 'rowAndColumn':
        for (const c of cottages) {
          if (rowOf(c, cols) === rowOf(b.square, cols) || colOf(c, cols) === colOf(b.square, cols)) fixed.add(c);
        }
        break;
      case 'contiguousGroup':
        greenhouses++;
        break;
      case 'rowOrColumnPerCoin':
        hasRowColPerCoin = true;
        break;
      case 'adjacentPlusPerCoinPer2':
        hasPerCoinPer2 = true;
        // Nachbarn füttert die Zehntscheune gratis
        for (const n of neighbors4(b.square, cols, rows)) if (cottages.includes(n)) fixed.add(n);
        break;
    }
  }

  const groups = cottageGroups(buildings, cols, rows);

  // Gewächshaus-Kombinationen (jede Wahl unabhängig; Duplikate egal)
  let bases: Set<number>[] = [fixed];
  for (let g = 0; g < greenhouses && groups.length > 0; g++) {
    const next: Set<number>[] = [];
    for (const base of bases) {
      for (const group of groups) {
        const s = new Set(base);
        for (const sq of group) s.add(sq);
        next.push(s);
      }
    }
    bases = dedupeSets(next);
    // Sicherheitsgrenze, skaliert mit der Brettfläche (die Landpartie hat mehr
    // Felder und damit mehr Hütten als das klassische 4×4)
    const basesCap = cols * rows > NUM_SQUARES ? 96 : 64;
    if (bases.length > basesCap) bases = bases.slice(0, basesCap);
  }

  // Bauernhof-Kapazität auf die restlichen Hütten verteilen
  let results: FeedCandidate[] = [];
  for (const base of bases) {
    const remaining = cottages.filter((c) => !base.has(c));
    if (anywhereCapacity >= remaining.length) {
      const s = new Set(base);
      for (const c of remaining) s.add(c);
      results.push({ fed: s, coinsSpent: 0 });
    } else if (anywhereCapacity === 0) {
      results.push({ fed: base, coinsSpent: 0 });
    } else {
      const combos = combinations(remaining, anywhereCapacity);
      if (combos.length <= 2000) {
        for (const combo of combos) {
          const s = new Set(base);
          for (const c of combo) s.add(c);
          results.push({ fed: s, coinsSpent: 0 });
        }
      } else {
        // Fallback: Hütten neben Tempeln bevorzugen
        const templeAdj = new Set<number>();
        for (const b of buildings) {
          if (b.def.scoring.type === 'ifAdjacentAtLeast') {
            for (const n of neighbors4(b.square, cols, rows)) templeAdj.add(n);
          }
        }
        const sorted = [...remaining].sort((a, b) => Number(templeAdj.has(b)) - Number(templeAdj.has(a)));
        const s = new Set(base);
        for (const c of sorted.slice(0, anywhereCapacity)) s.add(c);
        results.push({ fed: s, coinsSpent: 0 });
      }
    }
  }
  results = dedupeCandidates(results);

  // Root Cellar: je 1 Münze füttert alle Hütten einer Zeile/Spalte
  if (hasRowColPerCoin && p.coins > 0) {
    const lines: number[][] = [];
    for (let i = 0; i < rows; i++) lines.push(cottages.filter((c) => rowOf(c, cols) === i));
    for (let i = 0; i < cols; i++) lines.push(cottages.filter((c) => colOf(c, cols) === i));
    const usefulLines = lines.filter((l) => l.length > 0);
    const expanded: FeedCandidate[] = [...results];
    for (const cand of results) {
      for (let k = 1; k <= Math.min(p.coins - cand.coinsSpent, usefulLines.length); k++) {
        for (const combo of combinations(usefulLines, k)) {
          const s = new Set(cand.fed);
          for (const line of combo) for (const c of line) s.add(c);
          expanded.push({ fed: s, coinsSpent: cand.coinsSpent + k });
        }
      }
    }
    results = dedupeCandidates(expanded);
  }

  // Tithe Barn: 1 Münze je 2 weitere Hütten (beliebig)
  if (hasPerCoinPer2 && p.coins > 0) {
    const expanded: FeedCandidate[] = [...results];
    for (const cand of results) {
      const remaining = cottages.filter((c) => !cand.fed.has(c));
      const budget = p.coins - cand.coinsSpent;
      const maxFeed = Math.min(remaining.length, budget * 2);
      for (let n = 1; n <= maxFeed; n++) {
        const cost = Math.ceil(n / 2);
        if (cost > budget) break;
        for (const combo of combinations(remaining, n).slice(0, 500)) {
          const s = new Set(cand.fed);
          for (const c of combo) s.add(c);
          expanded.push({ fed: s, coinsSpent: cand.coinsSpent + cost });
        }
      }
    }
    results = dedupeCandidates(expanded);
  }

  return results;
}

function dedupeSets(sets: Set<number>[]): Set<number>[] {
  const seen = new Set<string>();
  const out: Set<number>[] = [];
  for (const s of sets) {
    const k = [...s].sort((a, b) => a - b).join(',');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

/** Dedupe: je Fütterungs-Menge nur die günstigste Münz-Ausgabe behalten. */
function dedupeCandidates(cands: FeedCandidate[]): FeedCandidate[] {
  const best = new Map<string, FeedCandidate>();
  for (const c of cands) {
    const k = [...c.fed].sort((a, b) => a - b).join(',');
    const prev = best.get(k);
    if (!prev || c.coinsSpent < prev.coinsSpent) best.set(k, c);
  }
  return [...best.values()];
}

// ---------- Wertung ----------

export function scoreGame(state: GameState, catalog: Catalog): PlayerScore[] {
  return state.players.map((_, i) => scorePlayer(state, i, catalog));
}

export function scorePlayer(state: GameState, playerIndex: number, catalog: Catalog): PlayerScore {
  const p = state.players[playerIndex];
  let best: PlayerScore | null = null;
  for (const cand of feedingCandidates(p, catalog)) {
    const s = scoreWithFeeding(state, playerIndex, cand, catalog);
    if (!best || s.total > best.total) best = s;
  }
  return best!;
}

function scoreWithFeeding(
  state: GameState,
  playerIndex: number,
  candidate: FeedCandidate,
  catalog: Catalog
): PlayerScore {
  const fed = candidate.fed;
  const p = state.players[playerIndex];
  const { cols, rows } = dimsOf(p.board);
  const buildings = placedBuildings(p, catalog);
  const hasEffect = (e: string) => buildings.some((b) => (b.def.effects ?? []).includes(e as never));

  const lines = new Map<string, ScoreLine>();
  const addPoints = (card: string, pts: number) => {
    const line = lines.get(card) ?? { card, count: 0, points: 0 };
    line.points += pts;
    lines.set(card, line);
  };
  // Zähler je Karte
  for (const b of buildings) {
    const line = lines.get(b.card) ?? { card: b.card, count: 0, points: 0 };
    line.count++;
    lines.set(b.card, line);
  }

  const countByCardHandled = new Set<string>();

  for (const b of buildings) {
    const spec = b.def.scoring;
    switch (spec.type) {
      case 'none':
        break;
      case 'flat':
        addPoints(b.card, spec.vp);
        break;
      case 'ifFed': {
        if (fed.has(b.square)) {
          addPoints(b.card, spec.vp);
        } else if (b.def.category === 'cottage' && hasEffect('mausoleum')) {
          // Mausoleum: ungefütterte Hütten (nur Kategorie cottage) sind 3 SP wert
          addPoints(b.card, 3);
        }
        break;
      }
      case 'byCountTable': {
        if (countByCardHandled.has(b.card)) break;
        countByCardHandled.add(b.card);
        const count = lines.get(b.card)!.count;
        const pts = count <= spec.table.length ? spec.table[count - 1] : spec.overflow;
        addPoints(b.card, pts);
        break;
      }
      case 'perAdjacent': {
        let sum = 0;
        for (const n of neighbors4(b.square, cols, rows)) {
          const nb = p.board[n].building;
          if (!nb) continue;
          const nd = catalog[nb.card];
          if (matchesSelector(spec.target, nd, b.def, fed, n)) sum += selectorWeight(spec.target, nd);
        }
        addPoints(b.card, sum * spec.vpEach);
        break;
      }
      case 'ifAdjacentAny': {
        const hit = neighbors4(b.square, cols, rows).some((n) => {
          const nb = p.board[n].building;
          return !!nb && spec.targets.some((t) => matchesSelector(t, catalog[nb.card], b.def, fed, n));
        });
        if (hit) addPoints(b.card, spec.vp);
        break;
      }
      case 'ifNotAdjacentAny': {
        const hit = neighbors4(b.square, cols, rows).some((n) => {
          const nb = p.board[n].building;
          return !!nb && spec.targets.some((t) => matchesSelector(t, catalog[nb.card], b.def, fed, n));
        });
        if (!hit) addPoints(b.card, spec.vp);
        break;
      }
      case 'ifAdjacentAtLeast': {
        let sum = 0;
        for (const n of neighbors4(b.square, cols, rows)) {
          const nb = p.board[n].building;
          if (!nb) continue;
          const nd = catalog[nb.card];
          if (matchesSelector(spec.target, nd, b.def, fed, n)) sum += selectorWeight(spec.target, nd);
        }
        if (sum >= spec.count) addPoints(b.card, spec.vp);
        break;
      }
      case 'perInTown': {
        let sum = 0;
        for (const o of buildings) {
          if (matchesSelector(spec.target, o.def, b.def, fed, o.square)) sum += selectorWeight(spec.target, o.def);
        }
        addPoints(b.card, sum * spec.vpEach);
        break;
      }
      case 'perAdjacentTerrain': {
        // Landpartie: das Gebäude schaut auf die Landschaft nebenan
        let sum = 0;
        for (const n of neighbors4(b.square, cols, rows)) {
          const tk = p.board[n].terrain;
          if (tk && spec.terrains.includes(tk)) sum++;
        }
        addPoints(b.card, sum * spec.vpEach);
        break;
      }
      case 'ifAdjacentTerrain': {
        const hit = neighbors4(b.square, cols, rows).some((n) => {
          const tk = p.board[n].terrain;
          return !!tk && spec.terrains.includes(tk);
        });
        if (hit) addPoints(b.card, spec.vp);
        break;
      }
      case 'perInZone': {
        const zone = spec.zone === 'corners' ? cornerSquares(cols, rows) : centerSquares(cols, rows);
        let sum = 0;
        for (const o of buildings) {
          if (zone.includes(o.square) && matchesSelector(spec.target, o.def, b.def, fed, o.square)) {
            sum += selectorWeight(spec.target, o.def);
          }
        }
        addPoints(b.card, (spec.base ?? 0) + sum * spec.vpEach);
        break;
      }
      case 'perUniqueTypesInRowCol': {
        const types = new Set<string>();
        for (const o of buildings) {
          if (o.square === b.square || o.card === b.card) continue;
          if (rowOf(o.square, cols) === rowOf(b.square, cols) || colOf(o.square, cols) === colOf(b.square, cols)) {
            types.add(o.card);
          }
        }
        addPoints(b.card, types.size * spec.vpEach);
        break;
      }
      case 'perSameCardInRowCol': {
        // Gleiche Karte in Zeile ∪ Spalte, sich selbst einmal mitgezählt (max 7)
        let sum = 0;
        for (const o of buildings) {
          if (o.card !== b.card) continue;
          if (o.square === b.square) { sum++; continue; }
          if (rowOf(o.square, cols) === rowOf(b.square, cols)) sum++;
          if (colOf(o.square, cols) === colOf(b.square, cols)) sum++;
        }
        addPoints(b.card, sum * spec.vpEach);
        break;
      }
      case 'ifAloneInRowAndCol': {
        const other = buildings.some(
          (o) =>
            o.square !== b.square &&
            matchesSelector(spec.target, o.def, b.def, fed, o.square) &&
            (rowOf(o.square, cols) === rowOf(b.square, cols) || colOf(o.square, cols) === colOf(b.square, cols))
        );
        if (!other) addPoints(b.card, spec.vp);
        break;
      }
      case 'perOwnCountVsRightNeighbor': {
        if (countByCardHandled.has(b.card)) break;
        countByCardHandled.add(b.card);
        const own = lines.get(b.card)!.count;
        // Rechter Nachbar = vorheriger Spieler in Zugreihenfolge (Uhrzeigersinn)
        const n = state.players.length;
        const right = state.players[(playerIndex + n - 1) % n];
        const theirs = right === p ? 0 : right.board.filter((sq) => sq.building?.card === b.card).length;
        const each = own > theirs ? spec.baseEach + spec.bonusEach : spec.baseEach;
        addPoints(b.card, own * each);
        break;
      }
      case 'perStoredResource': {
        const stored = p.board[b.square].building?.stored?.length ?? 0;
        addPoints(b.card, stored * spec.vpEach);
        break;
      }
      case 'handler': {
        addPoints(b.card, scoreHandler(spec.handler, spec.vp ?? 0, state, playerIndex, b, buildings, catalog, fed));
        break;
      }
    }
  }

  // Leere Felder: kein Gebäude (Restmaterial zählt als leer; Bondmaker-Material
  // liegt AUF Gebäuden). Landschaft (Landpartie) ist nicht leer — auf ihr kann
  // nie gebaut werden, also darf sie auch keinen Punkt kosten.
  const emptySquares = p.board.filter((sq) => !sq.building && !sq.terrain).length;

  // Tiny Trees: Samen als EINZIGES unbebautes Feld → Baum (2 SP, Feld zählt nicht als leer)
  let treePoints: number | undefined;
  let penaltySquares = emptySquares;
  if (state.config.systems.trees) {
    const seed = p.seedSquare;
    const isTree =
      seed != null && seed >= 0 && !p.board[seed].building && emptySquares === 1;
    treePoints = isTree ? 2 : 0;
    if (isTree) penaltySquares -= 1;
  }
  const emptyPenalty = hasEffect('cathedral') || penaltySquares === 0 ? 0 : -penaltySquares;

  // Fortune: übrige Münzen (nach Fütterungs-Ausgaben)
  let coins: PlayerScore['coins'];
  if (state.config.systems.coins) {
    const remaining = Math.max(0, p.coins - candidate.coinsSpent);
    const value = hasEffect('coinValue2') ? 2 : 1;
    coins = { count: remaining, spent: candidate.coinsSpent, points: remaining * value };
  }

  const allLines = [...lines.values()];
  const total =
    allLines.reduce((s, l) => s + l.points, 0) +
    emptyPenalty + (coins?.points ?? 0) + (treePoints ?? 0);

  let fedCottages = 0;
  for (const b of buildings) if (isCottage(b.def) && fed.has(b.square)) fedCottages += cottageWeight(b.def);

  return { lines: allLines, emptySquares, emptyPenalty, total, fedCottages, coins, treePoints };
}

function scoreHandler(
  handler: string,
  baseVp: number,
  state: GameState,
  playerIndex: number,
  self: Placed,
  buildings: Placed[],
  catalog: Catalog,
  fed: Set<number>
): number {
  const p = state.players[playerIndex];
  const { cols, rows } = dimsOf(p.board);
  switch (handler) {
    case 'archive': {
      const types = new Set(buildings.filter((b) => b.def.kind !== 'monument').map((b) => b.card));
      return baseVp + types.size;
    }
    case 'mandras': {
      const types = new Set<string>();
      for (const n of neighbors4(self.square, cols, rows)) {
        const nb = p.board[n].building;
        if (nb) types.add(nb.card);
      }
      return baseVp + types.size * 2;
    }
    case 'skyBaths': {
      const builtTypes = new Set(buildings.map((b) => b.card));
      const missing = state.config.activeCards.filter((c) => !builtTypes.has(c)).length;
      return baseVp + missing * 2;
    }
    case 'silva': {
      // größte zusammenhängende Gruppe gleicher Gebäudetypen
      const seen = new Set<number>();
      let largest = 0;
      for (const b of buildings) {
        if (seen.has(b.square)) continue;
        let groupSize = 0;
        const stack = [b.square];
        seen.add(b.square);
        while (stack.length) {
          const cur = stack.pop()!;
          groupSize++;
          for (const n of neighbors4(cur, cols, rows)) {
            const nb = p.board[n].building;
            if (nb && nb.card === b.card && !seen.has(n)) {
              seen.add(n);
              stack.push(n);
            }
          }
        }
        largest = Math.max(largest, groupSize);
      }
      return baseVp + largest;
    }
    case 'shrine': {
      const n = p.shrineSnapshot ?? buildings.length;
      const table = [1, 2, 3, 4, 5];
      return baseVp + (n <= 0 ? 0 : n <= 5 ? table[n - 1] : 8);
    }
    case 'starloom': {
      const myRound = p.finishRound ?? Number.MAX_SAFE_INTEGER;
      const rank = 1 + state.players.filter(
        (o) => o !== p && (o.finishRound ?? Number.MAX_SAFE_INTEGER) < myRound
      ).length;
      const byRank = [6, 3, 2];
      return baseVp + (rank <= 3 ? byRank[rank - 1] : 0);
    }
    case 'schoolhouse': {
      // Fortune: 2 SP bei gefütterter Nachbar-Hütte; +2 SP bei Münzen ≥ rechter Nachbar
      const fedAdjacent = neighbors4(self.square, cols, rows).some((n) => {
        const nb = p.board[n].building;
        return !!nb && isCottage(catalog[nb.card]) && fed.has(n);
      });
      if (!fedAdjacent) return 0;
      const n = state.players.length;
      const right = state.players[(playerIndex + n - 1) % n];
      const bonus = right === p || p.coins >= right.coins ? 2 : 0;
      return 2 + bonus;
    }
    case 'eraflage': {
      // Fortune: 9 SP nur gefüttert; −2 SP je einzigartigem Gebäudetyp in Zeile ∪ Spalte
      const types = new Set<string>();
      for (const o of buildings) {
        if (o.square === self.square) continue;
        if (rowOf(o.square, cols) === rowOf(self.square, cols) || colOf(o.square, cols) === colOf(self.square, cols)) {
          types.add(o.card);
        }
      }
      return (fed.has(self.square) ? baseVp : 0) - types.size * 2;
    }
    case 'hollowHill': {
      // Fortune: −2 SP je Münztausch nach dem Bau
      return baseVp - 2 * (p.hollowHillSwaps ?? 0);
    }
    default:
      return baseVp;
  }
}

export { isCottage, cottageWeight, feedingCandidates };
