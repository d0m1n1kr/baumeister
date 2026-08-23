// Zustandsmaschine der Partie: apply(state, action) → neuer State (immutable).

import type {
  Action, Catalog, GameConfig, GameState, PendingChoice, PlayerState, Resource, Square
} from './types';
import { NUM_SQUARES } from './types';
import { matchesPattern } from './patterns';

export const SAVE_VERSION = 1;

export class RuleError extends Error {}

function fail(msg: string): never {
  throw new RuleError(msg);
}

export function newGame(config: GameConfig): GameState {
  const players: PlayerState[] = config.players.map((p, i) => ({
    name: p.name,
    corner: p.corner,
    board: Array.from({ length: NUM_SQUARES }, (): Square => ({})),
    monumentOptions: config.useMonuments ? [...config.monumentDeals[i]] : undefined,
    monument: undefined,
    pending: null,
    placedSquare: null,
    roundDone: false,
    done: false,
    masterBuilderTurns: 0,
    choices: []
  }));
  return {
    config,
    players,
    phase: config.useMonuments ? { t: 'monumentDraft' } : { t: 'nameResource' },
    masterBuilder: config.firstMasterBuilder,
    round: 0,
    v: SAVE_VERSION
  };
}

export function apply(state: GameState, action: Action, catalog: Catalog): GameState {
  // JSON-Klon statt structuredClone: funktioniert auch mit Sveltes $state-Proxys,
  // und der Spielzustand ist reines JSON (wird ohnehin so persistiert).
  const s: GameState = JSON.parse(JSON.stringify(state));
  switch (action.t) {
    case 'chooseMonument': return chooseMonument(s, action.player, action.card);
    case 'nameResource': return nameResource(s, action.resource, catalog);
    case 'factorySwap': return factorySwap(s, action.player, action.take, catalog);
    case 'placeResource': return placeResource(s, action.player, action.square, catalog);
    case 'moveResource': return moveResource(s, action.player, action.square, catalog);
    case 'warehouseStore': return warehouseStore(s, action.player, action.square, catalog);
    case 'warehouseSwap': return warehouseSwap(s, action.player, action.square, action.storedIndex, catalog);
    case 'build': return build(s, action.player, action.squares, action.card, action.target, catalog);
    case 'resolveMark': return resolveMark(s, action.player, action.resource, catalog);
    case 'resolveGrove': return resolveGrove(s, action.player, action.card, action.square, catalog);
    case 'resolveGuild': return resolveGuild(s, action.player, action.square, action.newCard, catalog);
    case 'resolveOpaleyeSetup': return resolveOpaleyeSetup(s, action.player, action.card, catalog);
    case 'resolveOpaleyeClaim': return resolveOpaleyeClaim(s, action.player, action.accept, action.square);
    case 'roundDone': return roundDone(s, action.player, catalog);
    case 'declareComplete': return declareComplete(s, action.player, catalog);
  }
}

// ---------- Setup ----------

function chooseMonument(s: GameState, player: number, card: string): GameState {
  if (s.phase.t !== 'monumentDraft') fail('Kein Monument-Draft aktiv');
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  if (!p.monumentOptions?.includes(card)) fail('Karte nicht unter den Optionen');
  p.monument = { card, built: false };
  p.monumentOptions = undefined;
  if (s.players.every((pl) => pl.monument)) {
    s.phase = { t: 'nameResource' };
  }
  return s;
}

// ---------- Rundenablauf ----------

function nameResource(s: GameState, resource: Resource, catalog: Catalog): GameState {
  if (s.phase.t !== 'nameResource') fail('Jetzt wird kein Material angesagt');
  const mb = s.players[s.masterBuilder];
  // Bank: markiertes Material darf der Besitzer nie selbst ansagen
  for (const sq of mb.board) {
    if (
      sq.building?.marked === resource &&
      catalog[sq.building.card]?.effects?.includes('bank')
    ) {
      fail('Dieses Material ist durch deine Bank gesperrt');
    }
  }
  s.round++;
  mb.masterBuilderTurns++;
  for (const p of s.players) {
    p.placedSquare = null;
    if (p.done) {
      p.pending = null;
      p.roundDone = true;
    } else {
      p.pending = resource;
      p.roundDone = false;
    }
  }
  s.phase = { t: 'round', resource };
  return s;
}

function requireRound(s: GameState): Resource {
  if (s.phase.t !== 'round') fail('Keine laufende Runde');
  return s.phase.resource;
}

function activePlayer(s: GameState, player: number): PlayerState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  if (p.done) fail('Stadt ist bereits fertig');
  return p;
}

function factorySwap(s: GameState, player: number, take: Resource, catalog: Catalog): GameState {
  const named = requireRound(s);
  const p = activePlayer(s, player);
  if (p.pending !== named) fail('Tausch nur vor dem Platzieren des angesagten Materials');
  if (s.masterBuilder === player) fail('Die Fabrik wirkt nur bei fremder Ansage');
  const hasMatch = p.board.some(
    (sq) => sq.building?.marked === named && catalog[sq.building.card]?.effects?.includes('factory')
  );
  if (!hasMatch) fail('Keine Fabrik mit diesem Material');
  p.pending = take;
  return s;
}

/** Prüft, ob ein Feld das angesagte Material aufnehmen darf (leer oder Bondmaker-Hütte). */
function checkPlacementTarget(
  s: GameState, p: PlayerState, player: number, square: number, catalog: Catalog
) {
  const sq = p.board[square] ?? fail('Ungültiges Feld');
  if (sq.resource) fail('Feld ist belegt');
  if (sq.building) {
    // Statue des Bondmakers: angesagtes Material auf eine Hütte legen
    const hasBondmaker = p.monument?.built &&
      catalog[p.monument.card]?.effects?.includes('bondmaker');
    if (!hasBondmaker) fail('Feld ist bebaut');
    if (s.masterBuilder === player) fail('Bondmaker wirkt nur bei fremder Ansage');
    const def = catalog[sq.building.card];
    const cottageLike = def.category === 'cottage' || (def.effects ?? []).includes('barrettCastle');
    if (!cottageLike) fail('Material kann nur auf Hütten gelagert werden');
  }
  return sq;
}

function placeResource(s: GameState, player: number, square: number, catalog: Catalog): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.pending == null) fail('Kein Material zum Platzieren');
  const sq = checkPlacementTarget(s, p, player, square, catalog);
  sq.resource = p.pending;
  p.pending = null;
  p.placedSquare = square;
  return s;
}

/** Unbestätigtes Material dieser Runde verschieben (bis zum „Fertig"). */
function moveResource(s: GameState, player: number, square: number, catalog: Catalog): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.roundDone) fail('Runde bereits beendet');
  if (p.pending != null) fail('Erst das Material platzieren');
  const src = p.placedSquare;
  if (src == null) fail('Kein verschiebbares Material');
  if (src === square) return s;
  const srcSq = p.board[src];
  if (!srcSq?.resource) fail('Material wurde bereits verbaut');
  const sq = checkPlacementTarget(s, p, player, square, catalog);
  sq.resource = srcSq.resource;
  delete srcSq.resource;
  p.placedSquare = square;
  return s;
}

function findWarehouse(p: PlayerState, square: number, catalog: Catalog) {
  const b = p.board[square]?.building;
  if (!b || !catalog[b.card]?.effects?.includes('warehouse')) fail('Kein Lagerhaus auf diesem Feld');
  b.stored ??= [];
  return b;
}

function warehouseStore(s: GameState, player: number, square: number, catalog: Catalog): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.pending == null) fail('Kein Material zum Einlagern');
  const wh = findWarehouse(p, square, catalog);
  if (wh.stored!.length >= 3) fail('Lagerhaus ist voll');
  wh.stored!.push(p.pending);
  p.pending = null;
  return s;
}

function warehouseSwap(
  s: GameState, player: number, square: number, storedIndex: number, catalog: Catalog
): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.pending == null) fail('Kein Material zum Tauschen');
  const wh = findWarehouse(p, square, catalog);
  const old = wh.stored![storedIndex] ?? fail('Kein Material an dieser Position');
  wh.stored![storedIndex] = p.pending;
  p.pending = old;
  return s;
}

// ---------- Bauen ----------

function build(
  s: GameState, player: number, squares: number[], card: string, target: number, catalog: Catalog
): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  const def = catalog[card] ?? fail('Unbekannte Karte');

  const isMonument = def.kind === 'monument';
  if (isMonument) {
    if (p.monument?.card !== card || p.monument.built) fail('Monument nicht baubar');
  } else if (!s.config.activeCards.includes(card)) {
    fail('Karte ist in dieser Partie nicht im Spiel');
  }

  if (!matchesPattern(card, { board: p.board, squares, catalog })) {
    fail('Auswahl entspricht nicht dem Baumuster');
  }

  // Bauplatz prüfen
  const anywhere =
    (def.effects ?? []).includes('buildAnywhereSelf') ||
    p.board.some(
      (sq) => sq.building && (catalog[sq.building.card]?.effects ?? []).includes('buildAnywhereAll')
    );
  const resourceSquares = squares.filter((i) => p.board[i].resource);
  const targetSq = p.board[target] ?? fail('Ungültiger Bauplatz');
  if (anywhere) {
    const emptyAfter = !targetSq.building && (!targetSq.resource || resourceSquares.includes(target));
    if (!emptyAfter) fail('Bauplatz ist nicht frei');
  } else if (!resourceSquares.includes(target)) {
    fail('Bauplatz muss eines der Materialfelder sein');
  }

  // Materialien entfernen (Handelsposten bleiben stehen)
  for (const i of resourceSquares) delete p.board[i].resource;
  p.board[target].building = { card };

  if (isMonument) p.monument!.built = true;

  // Schrein: Gebäudezahl zum Bauzeitpunkt festhalten (inkl. Schrein selbst)
  if (def.scoring.type === 'handler' && def.scoring.handler === 'shrine') {
    p.shrineSnapshot = p.board.filter((sq) => sq.building).length;
  }

  // Effekte nach dem Bau → Entscheidungen einreihen
  const effects = def.effects ?? [];
  if (effects.includes('factory') || effects.includes('bank')) {
    p.choices.push({ t: 'markResource', square: target, card });
  }
  if (effects.includes('groveUniversity')) {
    p.choices.push({ t: 'groveUniversity', square: target });
  }
  if (effects.includes('architectsGuild')) {
    p.choices.push({ t: 'architectsGuild', square: target, remaining: 2 });
  }
  if (effects.includes('opaleye')) {
    p.choices.push({ t: 'opaleyeSetup', square: target, remaining: 3 });
  }

  // Opaleyes Wacht der Sitznachbarn: bevorrateten Typ erhalten
  if (!isMonument) {
    const n = s.players.length;
    const neighborIdxs = n <= 2 ? [ (player + 1) % n ] : [ (player + 1) % n, (player + n - 1) % n ];
    for (const ni of new Set(neighborIdxs)) {
      if (ni === player) continue;
      const np = s.players[ni];
      if (np.done) continue;
      for (const sq2 of np.board) {
        if (sq2.building?.stock?.includes(card)) {
          const square2 = np.board.indexOf(sq2);
          const already = np.choices.some(
            (c) => c.t === 'opaleyeClaim' && c.square === square2 && c.card === card
          );
          if (!already) np.choices.push({ t: 'opaleyeClaim', square: square2, card });
          break;
        }
      }
    }
  }

  return s;
}

// ---------- Entscheidungen ----------

function takeChoice<T extends PendingChoice['t']>(
  p: PlayerState, t: T
): Extract<PendingChoice, { t: T }> {
  const i = p.choices.findIndex((c) => c.t === t);
  if (i < 0) fail('Keine solche Entscheidung offen');
  return p.choices[i] as Extract<PendingChoice, { t: T }>;
}

function removeChoice(p: PlayerState, choice: PendingChoice): void {
  p.choices.splice(p.choices.indexOf(choice), 1);
}

function resolveMark(s: GameState, player: number, resource: Resource, catalog: Catalog): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'markResource');
  const b = p.board[choice.square].building!;
  if (catalog[b.card]?.effects?.includes('bank')) {
    // Bank: Material darf auf keiner anderen eigenen Bank liegen
    const clash = p.board.some(
      (sq) =>
        sq.building !== b &&
        sq.building?.marked === resource &&
        catalog[sq.building.card]?.effects?.includes('bank')
    );
    if (clash) fail('Material liegt bereits auf einer anderen Bank');
  }
  b.marked = resource;
  removeChoice(p, choice);
  return s;
}

function resolveGrove(
  s: GameState, player: number, card: string | null, square: number | undefined, catalog: Catalog
): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'groveUniversity');
  if (card != null) {
    if (!s.config.activeCards.includes(card)) fail('Karte nicht im Vorrat');
    if (catalog[card]?.kind === 'monument') fail('Monumente nicht erlaubt');
    const sq = p.board[square ?? -1] ?? fail('Ungültiges Feld');
    if (sq.building || sq.resource) fail('Feld ist belegt');
    sq.building = { card };
  }
  removeChoice(p, choice);
  return s;
}

function resolveGuild(
  s: GameState, player: number, square: number | null, newCard: string | undefined, catalog: Catalog
): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'architectsGuild');
  if (square == null) {
    removeChoice(p, choice);
    return s;
  }
  const sq = p.board[square] ?? fail('Ungültiges Feld');
  if (!sq.building) fail('Kein Gebäude auf diesem Feld');
  if (catalog[sq.building.card]?.kind === 'monument') fail('Monumente können nicht ersetzt werden');
  if (!newCard || !s.config.activeCards.includes(newCard)) fail('Ersatzkarte nicht im Vorrat');
  if (catalog[newCard]?.kind === 'monument') fail('Monumente nicht erlaubt');
  sq.building = { card: newCard };
  choice.remaining--;
  if (choice.remaining <= 0) removeChoice(p, choice);
  return s;
}

function resolveOpaleyeSetup(
  s: GameState, player: number, card: string | null, catalog: Catalog
): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'opaleyeSetup');
  if (card == null) {
    removeChoice(p, choice);
    return s;
  }
  if (!s.config.activeCards.includes(card)) fail('Karte nicht im Vorrat');
  if (catalog[card]?.kind === 'monument') fail('Monumente nicht erlaubt');
  const b = p.board[choice.square].building!;
  b.stock ??= [];
  if (b.stock.includes(card)) fail('Typ bereits bevorratet');
  b.stock.push(card);
  choice.remaining--;
  if (choice.remaining <= 0) removeChoice(p, choice);
  return s;
}

function resolveOpaleyeClaim(
  s: GameState, player: number, accept: boolean, square: number | undefined
): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'opaleyeClaim');
  if (accept) {
    const sq = p.board[square ?? -1] ?? fail('Ungültiges Feld');
    if (sq.building || sq.resource) fail('Feld ist belegt');
    sq.building = { card: choice.card };
    const stock = p.board[choice.square].building?.stock;
    if (stock) stock.splice(stock.indexOf(choice.card), 1);
  }
  removeChoice(p, choice);
  return s;
}

// ---------- Rundenende / Spielende ----------

function roundDone(s: GameState, player: number, catalog: Catalog): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.pending != null) fail('Erst das Material platzieren');
  if (p.choices.length > 0) fail('Erst offene Entscheidungen klären');
  p.roundDone = true;
  p.placedSquare = null;
  return maybeAdvance(s, catalog);
}

function declareComplete(s: GameState, player: number, catalog: Catalog): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.board.some((sq) => !sq.building && !sq.resource)) fail('Es gibt noch freie Felder');
  p.done = true;
  p.finishRound = s.round;
  p.pending = null;
  p.placedSquare = null;
  p.roundDone = true;
  p.choices = [];
  return maybeAdvance(s, catalog);
}

function maybeAdvance(s: GameState, catalog: Catalog): GameState {
  const active = s.players.filter((p) => !p.done);
  if (active.length === 0) {
    s.phase = { t: 'gameOver' };
    return s;
  }
  const allDone = s.players.every((p) => p.roundDone && p.choices.length === 0);
  if (!allDone) return s;

  s.masterBuilder = nextMasterBuilder(s, catalog);
  s.phase = { t: 'nameResource' };
  return s;
}

export function hasFortIronweed(p: PlayerState, catalog: Catalog): boolean {
  return p.board.some(
    (sq) => sq.building && (catalog[sq.building.card]?.effects ?? []).includes('fortIronweed')
  );
}

function nextMasterBuilder(s: GameState, catalog: Catalog): number {
  const n = s.players.length;
  // 1. Wahl: aktiver Spieler ohne Fort Ironweed
  for (let step = 1; step <= n; step++) {
    const i = (s.masterBuilder + step) % n;
    const p = s.players[i];
    if (!p.done && !hasFortIronweed(p, catalog)) return i;
  }
  // 2. Wahl: irgendein aktiver Spieler (Fort-Besitzer als letzte Verbleibende)
  for (let step = 1; step <= n; step++) {
    const i = (s.masterBuilder + step) % n;
    if (!s.players[i].done) return i;
  }
  return s.masterBuilder;
}
