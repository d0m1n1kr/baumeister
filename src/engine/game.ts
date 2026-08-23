// Zustandsmaschine der Partie: apply(state, action) → neuer State (immutable).

import type {
  Action, Catalog, GameConfig, GameState, PendingChoice, PlayerState, Resource, Square
} from './types';
import { CENTER_SQUARES, COIN_CAP, NUM_SQUARES, colOf, rowOf } from './types';
import { matchesPattern } from './patterns';

export const SAVE_VERSION = 2;

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
    choices: [],
    coins: 0,
    buildsThisRound: 0
  }));
  return {
    config,
    players,
    phase: config.useMonuments
      ? { t: 'monumentDraft' }
      : config.systems.trees
        ? { t: 'seedPlacement' }
        : { t: 'nameResource' },
    masterBuilder: config.firstMasterBuilder,
    round: 0,
    v: SAVE_VERSION
  };
}

function gainCoins(p: PlayerState, n: number): void {
  p.coins = Math.min(COIN_CAP, p.coins + n);
}

/** Hat der Spieler ein gebautes Gebäude mit diesem Effekt? */
function hasBuiltEffect(p: PlayerState, effect: string, catalog: Catalog): boolean {
  return p.board.some(
    (sq) => sq.building && (catalog[sq.building.card]?.effects ?? []).includes(effect as never)
  );
}

export function apply(state: GameState, action: Action, catalog: Catalog): GameState {
  // JSON-Klon statt structuredClone: funktioniert auch mit Sveltes $state-Proxys,
  // und der Spielzustand ist reines JSON (wird ohnehin so persistiert).
  const s: GameState = JSON.parse(JSON.stringify(state));
  switch (action.t) {
    case 'chooseMonument': return chooseMonument(s, action.player, action.card);
    case 'placeSeed': return placeSeed(s, action.player, action.square);
    case 'nameResource': return nameResource(s, action.resource, catalog);
    case 'factorySwap': return factorySwap(s, action.player, action.take, catalog);
    case 'coinSwap': return coinSwap(s, action.player, action.take);
    case 'oddityStore': return oddityStore(s, action.player, action.square, catalog);
    case 'oddityTake': return oddityTake(s, action.player, action.fromPlayer, action.fromSquare, action.targetSquare, catalog);
    case 'museumSell': return museumSell(s, action.player, action.square, action.storedIndex, catalog);
    case 'resolveMasons': return resolveMasons(s, action.player, action.card, action.square, catalog);
    case 'resolvePromenade': return resolvePromenade(s, action.player, action.square);
    case 'resolveSeedBonus': return resolveSeedBonus(s, action.player, action.resource, action.square);
    case 'placeResource': return placeResource(s, action.player, action.square, catalog);
    case 'cavern': return cavern(s, action.player);
    case 'moveResource': return moveResource(s, action.player, action.square, catalog);
    case 'warehouseStore': return warehouseStore(s, action.player, action.square, catalog);
    case 'warehouseSwap': return warehouseSwap(s, action.player, action.square, action.storedIndex, catalog);
    case 'build': return build(s, action.player, action.squares, action.card, action.target, catalog, action.prism);
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
    s.phase = s.config.systems.trees ? { t: 'seedPlacement' } : { t: 'nameResource' };
  }
  return s;
}

function placeSeed(s: GameState, player: number, square: number): GameState {
  if (s.phase.t !== 'seedPlacement') fail('Jetzt wird kein Samen gesetzt');
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  if (p.seedSquare != null) fail('Samen bereits gesetzt');
  const sq = p.board[square] ?? fail('Ungültiges Feld');
  if (sq.building || sq.resource) fail('Feld ist belegt');
  p.seedSquare = square;
  if (s.players.every((pl) => pl.seedSquare != null)) {
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
  s.oddityTaken = false;
  for (const p of s.players) {
    p.placedSquare = null;
    p.buildsThisRound = 0;
    p.museumSoldThisRound = false;
    p.prismUsedThisRound = false;
    p.prismCard = undefined;
    p.pendingLocked = false;
    p.pendingExtra = null;
    if (p.done) {
      p.pending = null;
      p.roundDone = true;
    } else {
      p.pending = resource;
      p.roundDone = false;
      // Southern Semaphore: 1 zusätzliches Material des angesagten Typs
      if (hasBuiltEffect(p, 'southernSemaphore', catalog)) p.pendingExtra = resource;
    }
  }
  s.phase = { t: 'round', resource };
  return s;
}

/** pending verbraucht: ggf. Zusatz-Material (Southern Semaphore) nachrücken. */
function consumePending(p: PlayerState): void {
  p.pending = null;
  if (p.pendingExtra) {
    p.pending = p.pendingExtra;
    p.pendingExtra = null;
    p.pendingLocked = true; // Zusatz-Material ist nicht tauschbar
  }
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
  if (p.pending !== named || p.pendingLocked) fail('Tausch nur vor dem Platzieren des angesagten Materials');
  if (s.masterBuilder === player) fail('Die Fabrik wirkt nur bei fremder Ansage');
  const hasMatch = p.board.some(
    (sq) => sq.building?.marked === named && catalog[sq.building.card]?.effects?.includes('factory')
  );
  if (!hasMatch) fail('Keine Fabrik mit diesem Material');
  p.pending = take;
  return s;
}

/** Fortune: 1 Münze zahlen, um ein beliebiges anderes Material zu nehmen. */
function coinSwap(s: GameState, player: number, take: Resource): GameState {
  const named = requireRound(s);
  if (!s.config.systems.coins) fail('Münzen sind nicht im Spiel');
  const p = activePlayer(s, player);
  if (p.pending !== named || p.pendingLocked) fail('Tausch nur vor dem Platzieren des angesagten Materials');
  if (s.masterBuilder === player) fail('Der Baumeister muss sein angesagtes Material nehmen');
  if (take === named) fail('Bitte ein anderes Material wählen');
  if (p.coins < 1) fail('Keine Münze in der Truhe');
  p.coins--;
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
  consumePending(p);
  p.placedSquare = square;
  // Münze auf dem Feld (Promenade): bei fremder Ansage einsammeln
  if (sq.coin && s.masterBuilder !== player) {
    delete sq.coin;
    gainCoins(p, 1);
  }
  return s;
}

/**
 * Höhlen-Regel (offizielle Variante): Statt zu platzieren darf ein fremd
 * angesagtes Material beiseitegelegt werden — höchstens 2-mal pro Partie.
 * Es zählt am Ende weder Punkte noch Strafen; es ist schlicht weg.
 */
function cavern(s: GameState, player: number): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (!s.config.systems.cavern) fail('Die Höhlen-Regel ist in dieser Partie nicht aktiv');
  if (p.pending == null) fail('Kein Material zum Beiseitelegen');
  if (s.masterBuilder === player) fail('Die eigene Ansage muss platziert werden');
  if ((p.cavernUsed ?? 0) >= 2) fail('Die Höhle ist voll (höchstens 2 pro Partie)');
  p.cavernUsed = (p.cavernUsed ?? 0) + 1;
  consumePending(p); // ein evtl. Zusatz-Material (Semaphor) rückt regulär nach
  p.placedSquare = null;
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

/** Lager-Gebäude (Lagerhaus max 3, Museum max 2) auf dem Feld finden. */
function findStorage(p: PlayerState, square: number, catalog: Catalog) {
  const b = p.board[square]?.building;
  const effects = b ? (catalog[b.card]?.effects ?? []) : [];
  if (!b || (!effects.includes('warehouse') && !effects.includes('museum'))) {
    fail('Kein Lager-Gebäude auf diesem Feld');
  }
  b.stored ??= [];
  return { b, cap: effects.includes('warehouse') ? 3 : 2 };
}

function warehouseStore(s: GameState, player: number, square: number, catalog: Catalog): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.pending == null) fail('Kein Material zum Einlagern');
  const { b, cap } = findStorage(p, square, catalog);
  if (b.stored!.length >= cap) fail('Lager ist voll');
  b.stored!.push(p.pending);
  consumePending(p);
  return s;
}

function warehouseSwap(
  s: GameState, player: number, square: number, storedIndex: number, catalog: Catalog
): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.pending == null) fail('Kein Material zum Tauschen');
  const { b } = findStorage(p, square, catalog);
  if (!catalog[b.card]?.effects?.includes('warehouse')) fail('Tauschen nur beim Lagerhaus');
  const old = b.stored![storedIndex] ?? fail('Kein Material an dieser Position');
  b.stored![storedIndex] = p.pending;
  p.pending = old;
  return s;
}

/** Fortune, Oddity Shop: fremd angesagtes Material dort ablegen statt zu platzieren. */
function oddityStore(s: GameState, player: number, square: number, catalog: Catalog): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.pending == null) fail('Kein Material zum Ablegen');
  if (s.masterBuilder === player) fail('Nur bei fremder Ansage möglich');
  const b = p.board[square]?.building;
  if (!b || !catalog[b.card]?.effects?.includes('oddityShop')) fail('Kein Kuriositätenladen hier');
  b.stored ??= [];
  if (b.stored.length >= 1) fail('Der Kuriositätenladen ist belegt');
  b.stored.push(p.pending);
  consumePending(p);
  return s;
}

/** Fortune, Oddity Shop: der neue Baumeister nimmt vor der Ansage 1 fremdes Material. */
function oddityTake(
  s: GameState, player: number, fromPlayer: number, fromSquare: number,
  targetSquare: number, catalog: Catalog
): GameState {
  if (s.phase.t !== 'nameResource') fail('Nur vor der Material-Ansage möglich');
  if (s.masterBuilder !== player) fail('Nur der Baumeister darf zugreifen');
  if (s.oddityTaken) fail('Bereits in diesem Zug genutzt');
  if (fromPlayer === player) fail('Nur aus fremden Kuriositätenläden');
  const owner = s.players[fromPlayer] ?? fail('Unbekannter Spieler');
  const b = owner.board[fromSquare]?.building;
  if (!b || !catalog[b.card]?.effects?.includes('oddityShop') || !b.stored?.length) {
    fail('Dort liegt kein Material');
  }
  const p = s.players[player];
  const sq = p.board[targetSquare] ?? fail('Ungültiges Feld');
  if (sq.building || sq.resource) fail('Feld ist belegt');
  sq.resource = b.stored.pop()!;
  gainCoins(owner, 1);
  s.oddityTaken = true;
  return s;
}

/** Fortune, Museum: 1×/Runde 1 eingelagertes Material zurückgeben → +1 Münze. */
function museumSell(
  s: GameState, player: number, square: number, storedIndex: number, catalog: Catalog
): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.museumSoldThisRound) fail('Museum bereits in dieser Runde genutzt');
  const b = p.board[square]?.building;
  if (!b || !catalog[b.card]?.effects?.includes('museum')) fail('Kein Museum hier');
  if (!b.stored?.[storedIndex]) fail('Kein Material an dieser Position');
  b.stored.splice(storedIndex, 1);
  gainCoins(p, 1);
  p.museumSoldThisRound = true;
  return s;
}

// ---------- Bauen ----------

function build(
  s: GameState, player: number, squares: number[], card: string, target: number,
  catalog: Catalog, prism = false
): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  const def = catalog[card] ?? fail('Unbekannte Karte');
  const effects = def.effects ?? [];

  // Prisma-Schmiede: 1×/Runde bauen, ohne die Materialien zu entfernen
  if (prism) {
    if (!hasBuiltEffect(p, 'prismForge', catalog)) fail('Keine Prisma-Schmiede gebaut');
    if (p.prismUsedThisRound) fail('Prisma-Schmiede bereits in dieser Runde genutzt');
  }
  // Estival Festival: Baukosten 2 Münzen (Pflicht)
  if (effects.includes('constructCost2') && p.coins < 2) fail('Der Bau kostet 2 Münzen');

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

  // Materialien entfernen (Handelsposten bleiben stehen; Prisma: Materialien bleiben liegen)
  if (!prism) {
    for (const i of resourceSquares) delete p.board[i].resource;
    p.buildsThisRound++; // Fortune: 2+ Bauten durch Materialentfernen → 1 Münze am Rundenende
  } else {
    p.prismUsedThisRound = true;
    p.prismCard = card;
  }
  const targetCell = p.board[target];
  targetCell.building = { card };
  // Münze auf dem Bauplatz (Grotto) einsammeln
  if (targetCell.coin) {
    delete targetCell.coin;
    gainCoins(p, 1);
  }

  if (isMonument) p.monument!.built = true;

  // Schrein: Gebäudezahl zum Bauzeitpunkt festhalten (inkl. Schrein selbst)
  if (def.scoring.type === 'handler' && def.scoring.handler === 'shrine') {
    p.shrineSnapshot = p.board.filter((sq) => sq.building).length;
  }

  // Tiny Trees: Samen überbaut → Gratis-Material
  if (s.config.systems.trees && p.seedSquare === target) {
    p.seedSquare = -1;
    p.choices.push({ t: 'seedBonus' });
  }

  applyCoinEffects(s, p, def, target, catalog);

  // Effekte nach dem Bau → Entscheidungen einreihen
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
  if (effects.includes('masonsGuild') && p.coins > 0) {
    p.choices.push({ t: 'masonsGuild', square: target, picked: [] });
  }
  if (effects.includes('promenadeCoins')) {
    p.choices.push({ t: 'promenadeCoins', remaining: 3 });
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

/** Fortune: Münz-Effekte beim Bau (Reihenfolge: Kosten → Gewinne → Prüfungen). */
function applyCoinEffects(
  s: GameState, p: PlayerState, def: import('./types').CardDef, target: number, catalog: Catalog
): void {
  if (!s.config.systems.coins) return;
  const effects = def.effects ?? [];

  if (effects.includes('constructCost2')) p.coins -= 2; // Deckung vorab geprüft
  if (effects.includes('coinOnConstruct')) gainCoins(p, 1);
  if (effects.includes('coinOnConstruct2')) gainCoins(p, 2);
  if (effects.includes('gamblersDen') && p.coins === 1) gainCoins(p, 2);

  if (effects.includes('statueCoins')) {
    const counts = new Map<string, number>();
    for (const sq of p.board) {
      if (sq.building) counts.set(sq.building.card, (counts.get(sq.building.card) ?? 0) + 1);
    }
    let n = 0;
    for (const c of counts.values()) if (c >= 3) n++;
    gainCoins(p, n);
  }

  if (effects.includes('teahouseCoins')) {
    // +1 Münze je Gebäudetyp in Zeile ODER Spalte (bessere Achse), selbst ausgenommen, max 3
    const row = rowOf(target), col = colOf(target);
    const rowTypes = new Set<string>(), colTypes = new Set<string>();
    p.board.forEach((sq, i) => {
      if (!sq.building || i === target) return;
      if (rowOf(i) === row) rowTypes.add(sq.building.card);
      if (colOf(i) === col) colTypes.add(sq.building.card);
    });
    gainCoins(p, Math.min(3, Math.max(rowTypes.size, colTypes.size)));
  }

  if (effects.includes('jewelerToll')) {
    if (p.coins >= 1) p.coins--;
    else for (const o of s.players) if (o !== p) gainCoins(o, 1);
  }

  if (effects.includes('parsonageCheck')) {
    const cottages = p.board.filter((sq) => {
      if (!sq.building) return false;
      const d = catalog[sq.building.card];
      return d.category === 'cottage' || (d.effects ?? []).includes('barrettCastle');
    }).length;
    if (p.coins !== cottages) p.coins = 0;
  }

  if (effects.includes('cathedralTransform')) {
    if (p.coins >= 3) p.coins -= 3;
    else p.board[target].building = { card: 'cottage' }; // wird stattdessen eine Hütte
  }

  if (effects.includes('grottoCoins')) {
    for (const c of CENTER_SQUARES) {
      const sq = p.board[c];
      if (!sq.building && !sq.coin) sq.coin = true;
    }
  }
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

/** Masons' Guild: je 1 Münze → 1 weiteres, einzigartiges Gebäude aus dem Vorrat. */
function resolveMasons(
  s: GameState, player: number, card: string | null, square: number | undefined, catalog: Catalog
): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'masonsGuild');
  if (card == null) {
    removeChoice(p, choice);
    return s;
  }
  if (p.coins < 1) fail('Keine Münze mehr');
  if (!s.config.activeCards.includes(card)) fail('Karte nicht im Vorrat');
  if (catalog[card]?.kind === 'monument') fail('Monumente nicht erlaubt');
  if (choice.picked.includes(card)) fail('Jedes Gebäude nur einmal');
  const sq = p.board[square ?? -1] ?? fail('Ungültiges Feld');
  if (sq.building || sq.resource) fail('Feld ist belegt');
  p.coins--;
  sq.building = { card };
  choice.picked.push(card);
  if (p.coins === 0) removeChoice(p, choice);
  return s;
}

/** Petal Promenade (best effort): Münzen auf bis zu 3 freie Felder legen. */
function resolvePromenade(s: GameState, player: number, square: number | null): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'promenadeCoins');
  if (square == null) {
    removeChoice(p, choice);
    return s;
  }
  const sq = p.board[square] ?? fail('Ungültiges Feld');
  if (sq.building || sq.resource || sq.coin) fail('Feld ist belegt');
  sq.coin = true;
  choice.remaining--;
  if (choice.remaining <= 0) removeChoice(p, choice);
  return s;
}

/** Tiny Trees: Gratis-Material nach dem Überbauen des Samens. */
function resolveSeedBonus(
  s: GameState, player: number, resource: Resource | null, square: number | undefined
): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'seedBonus');
  if (resource != null) {
    const sq = p.board[square ?? -1] ?? fail('Ungültiges Feld');
    if (sq.building || sq.resource) fail('Feld ist belegt');
    sq.resource = resource;
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

/** Fortune: am Rundenende 1 Münze für 2+ Bauten durch Materialentfernen. */
function awardRoundCoins(s: GameState): void {
  if (!s.config.systems.coins) return;
  for (const p of s.players) {
    if (p.buildsThisRound >= 2) gainCoins(p, 1);
    p.buildsThisRound = 0;
  }
}

function maybeAdvance(s: GameState, catalog: Catalog): GameState {
  const active = s.players.filter((p) => !p.done);
  if (active.length === 0) {
    awardRoundCoins(s);
    s.phase = { t: 'gameOver' };
    return s;
  }
  const allDone = s.players.every((p) => p.roundDone && p.choices.length === 0);
  if (!allDone) return s;

  awardRoundCoins(s);
  s.masterBuilder = nextMasterBuilder(s, catalog);
  s.oddityTaken = false;
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
