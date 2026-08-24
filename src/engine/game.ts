// Zustandsmaschine der Partie: apply(state, action) → neuer State (immutable).

import type {
  Action, Catalog, GameConfig, GameState, PendingChoice, PlayerState, Resource, Square
} from './types';
import { BOARD_SIZE, CENTER_SQUARES, COIN_CAP, NUM_SQUARES, colOf, rowOf } from './types';
import { matchesPattern } from './patterns';
import { mulberry32, shuffled } from './registry';

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
  // Solo: 3 Karten offen auslegen, der Rest ist der Nachziehstapel
  const deck = config.solo && config.soloDeck ? [...config.soloDeck] : undefined;
  // Rathaus: 5 Karten verdeckt abwerfen, der Rest ist der Nachziehstapel
  const thDeck = config.townHall && config.townHallDeck ? [...config.townHallDeck] : undefined;
  return {
    config,
    players,
    soloOffer: deck ? deck.splice(0, 3) : undefined,
    soloDeck: deck,
    thDiscard: thDeck ? thDeck.splice(0, 5) : undefined,
    thDeck,
    thShuffles: thDeck ? 0 : undefined,
    phase: config.useMonuments
      ? { t: 'monumentDraft' }
      : config.systems.trees
        ? { t: 'seedPlacement' }
        : { t: 'nameResource' },
    masterBuilder: config.firstMasterBuilder,
    round: 0,
    train: config.systems.train
      ? { pos: config.trainStart ?? 0, wagons: [null, null, null] }
      : undefined,
    v: SAVE_VERSION
  };
}

// ---------- Eisenbahn (eigener Modus) ----------

/** Länge des Rundkurses: eine Position je Stadt, solo mit 2 Tunnel-Segmenten
 *  (der Zug hält dann alle 3 Runden). */
export function trainCycle(s: GameState): number {
  return Math.max(s.players.length, 3);
}

/** Spieler, an dessen Bahnhof der Zug in dieser Runde hält — sonst null. */
export function trainStopPlayer(s: GameState, catalog: Catalog): number | null {
  const train = s.train;
  if (!train || train.pos >= s.players.length) return null;
  const p = s.players[train.pos];
  if (p.done) return null;
  return hasStation(p, catalog) ? train.pos : null;
}

function hasStation(p: PlayerState, catalog: Catalog): boolean {
  return p.board.some(
    (sq) => sq.building && (catalog[sq.building.card]?.effects ?? []).includes('trainStation')
  );
}

/** Truhenkapazität: 4, +1 mit gebautem Münz-Slot-Monument (Fortune). */
function coinCap(p: PlayerState, catalog: Catalog): number {
  const slot = p.monument?.built && (catalog[p.monument.card]?.effects ?? []).includes('coinSlot');
  return COIN_CAP + (slot ? 1 : 0);
}

function gainCoins(p: PlayerState, n: number, catalog: Catalog): void {
  const before = p.coins;
  p.coins = Math.min(coinCap(p, catalog), p.coins + n);
  // Okavers Schatzkammer: Truhe auf 4 Münzen gefüllt → Gratis-Hütte anbieten
  if (
    before < COIN_CAP && p.coins >= COIN_CAP && !p.done &&
    hasBuiltEffect(p, 'okaverCottage', catalog) &&
    !p.choices.some((c) => c.t === 'okaverCottage')
  ) {
    p.choices.push({ t: 'okaverCottage' });
  }
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
  const next = dispatchAction(s, action, catalog);
  // Rundenabschluss zentral prüfen: Auch die letzte AUFGELÖSTE Entscheidung
  // eines bereits „fertigen" Spielers (Fabrik-Markierung nach altem Stand,
  // Opaleye-Anspruch eines Nachbarn, …) muss die Runde beenden können —
  // sonst warten alle für immer aufeinander.
  return next.phase.t === 'round' ? maybeAdvance(next, catalog) : next;
}

/**
 * Repariert einen festgefahrenen Spielstand (ältere Versionen konnten eine
 * Runde hinterlassen, in der alle fertig sind, der Abschluss aber nie lief).
 * Beim Laden eines Spielstands aufrufen; ein gesunder Stand bleibt unberührt.
 */
export function repairRound(state: GameState, catalog: Catalog): GameState {
  return state.phase.t === 'round' ? maybeAdvance(state, catalog) : state;
}

function dispatchAction(s: GameState, action: Action, catalog: Catalog): GameState {
  switch (action.t) {
    case 'chooseMonument': return chooseMonument(s, action.player, action.card);
    case 'placeSeed': return placeSeed(s, action.player, action.square);
    case 'nameResource': return nameResource(s, action.resource, catalog);
    case 'soloPick': return soloPick(s, action.index, catalog);
    case 'townHallDraw': return townHallDraw(s, catalog);
    case 'townHallPick': return townHallPick(s, action.player, action.resource, catalog);
    case 'factorySwap': return factorySwap(s, action.player, action.take, catalog);
    case 'coinSwap': return coinSwap(s, action.player, action.take, catalog);
    case 'oddityStore': return oddityStore(s, action.player, action.square, catalog);
    case 'oddityTake': return oddityTake(s, action.player, action.fromPlayer, action.fromSquare, action.targetSquare, catalog);
    case 'museumSell': return museumSell(s, action.player, action.square, catalog);
    case 'resolveMasons': return resolveMasons(s, action.player, action.card, action.square, catalog);
    case 'resolvePromenade': return resolvePromenade(s, action.player, action.square);
    case 'resolveMuseumStock': return resolveMuseumStock(s, action.player, action.resource);
    case 'resolveCathedral': return resolveCathedral(s, action.player, action.pay, action.square, catalog);
    case 'resolveOkaver': return resolveOkaver(s, action.player, action.square, catalog);
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
    case 'resolveOpaleyeClaim': return resolveOpaleyeClaim(s, action.player, action.accept, action.square, catalog);
    case 'trainDrop': return trainDrop(s, action.player, catalog);
    case 'trainSwap': return trainSwap(s, action.player, action.wagon, catalog);
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

/**
 * Solo-Modus (offizielle Variante): Eines der 3 ausliegenden Materialien wählen.
 * Die gewählte Karte wandert verdeckt unter den Stapel, von oben wird nachgezogen.
 */
function soloPick(s: GameState, index: number, catalog: Catalog): GameState {
  if (!s.config.solo || !s.soloOffer || !s.soloDeck) fail('Kein Solo-Spiel');
  const offer = s.soloOffer!;
  const deck = s.soloDeck!;
  const resource = offer[index] ?? fail('Ungültige Auswahl');
  const next = nameResource(s, resource, catalog);
  deck.push(resource); // gewählte Karte verdeckt nach unten …
  const drawn = deck.shift(); // … und von oben nachziehen
  if (drawn) offer[index] = drawn;
  else offer.splice(index, 1);
  return next;
}

function nameResource(s: GameState, resource: Resource, catalog: Catalog): GameState {
  if (s.phase.t !== 'nameResource') fail('Jetzt wird kein Material angesagt');
  if (s.config.townHall) fail('Rathaus-Modus: Es wird vom Stapel gezogen');
  const mb = s.players[s.masterBuilder];
  // Bank: markiertes Material darf der Besitzer nie selbst ansagen
  bankCheck(mb, resource, catalog);
  mb.masterBuilderTurns++;
  startRound(s, resource, catalog);
  return s;
}

/** Bank: dieses Material darf der Besitzer nie selbst ansagen/wählen. */
function bankCheck(p: PlayerState, resource: Resource, catalog: Catalog): void {
  for (const sq of p.board) {
    if (
      sq.building?.marked === resource &&
      catalog[sq.building.card]?.effects?.includes('bank')
    ) {
      fail('Dieses Material ist durch deine Bank gesperrt');
    }
  }
}

/** Gemeinsamer Rundenstart. resource = null: Rathaus-Runde mit freier Wahl. */
function startRound(s: GameState, resource: Resource | null, catalog: Catalog): void {
  s.round++;
  s.oddityTaken = false;
  s.players.forEach((p, pi) => {
    p.placedSquare = null;
    p.buildsThisRound = 0;
    p.museumSoldThisRound = false;
    p.prismUsedThisRound = false;
    p.prismCard = undefined;
    p.prismSquares = undefined;
    p.pendingLocked = false;
    p.pendingExtra = null;
    p.placedCoin = false;
    p.trainUsed = false;
    if (p.done) {
      p.pending = null;
      p.roundDone = true;
    } else {
      p.pending = resource;
      p.roundDone = false;
      // Southern Semaphore: 1 Zusatz-Material — nur bei FREMDER Ansage
      // (im Rathaus-Modus gilt jede gezogene Karte für alle als fremd)
      const foreign = s.config.townHall ? resource != null : pi !== s.masterBuilder;
      if (resource != null && foreign && hasBuiltEffect(p, 'southernSemaphore', catalog)) {
        p.pendingExtra = resource;
      }
    }
  });
  s.phase = { t: 'round', resource };
}

/**
 * Rathaus-Modus: Der Bürgermeister startet jede Runde. In zwei von drei
 * Runden zieht er die oberste Karte des Materialdecks (alle platzieren dieses
 * Material), jede dritte Runde wählt jeder Spieler frei aus dem Vorrat.
 * Leerer Stapel: Abwurf neu mischen und wieder 5 Karten verdeckt abwerfen.
 */
function townHallDraw(s: GameState, catalog: Catalog): GameState {
  if (s.phase.t !== 'nameResource') fail('Die Runde läuft bereits');
  if (!s.config.townHall) fail('Kein Rathaus-Spiel');
  if ((s.round + 1) % 3 === 0) {
    startRound(s, null, catalog); // freie Wahl
    return s;
  }
  const deck = s.thDeck ?? fail('Kein Materialdeck');
  const discard = (s.thDiscard ??= []);
  if (deck.length === 0) {
    const reshuffled = shuffled(discard, mulberry32((s.config.thSeed ?? 1) + (s.thShuffles ?? 0) * 7919));
    s.thShuffles = (s.thShuffles ?? 0) + 1;
    discard.length = 0;
    discard.push(...reshuffled.splice(0, 5)); // wieder 5 verdeckt abwerfen
    deck.push(...reshuffled);
  }
  const card = deck.shift() ?? fail('Materialdeck ist leer');
  discard.push(card);
  startRound(s, card, catalog);
  return s;
}

/** Rathaus, jede 3. Runde: jeder Spieler wählt sein Material selbst. */
function townHallPick(s: GameState, player: number, resource: Resource, catalog: Catalog): GameState {
  if (s.phase.t !== 'round' || s.phase.resource != null) fail('Jetzt wird nicht frei gewählt');
  const p = activePlayer(s, player);
  if (p.roundDone) fail('Runde bereits beendet');
  if (p.placedSquare != null) fail('Material wurde bereits platziert');
  // Fort Eisenkraut: setzt in Wahlrunden aus (außer als letzter aktiver Spieler)
  if (hasFortIronweed(p, catalog) && s.players.filter((o) => !o.done).length > 1) {
    fail('Fort Eisenkraut: keine freie Materialwahl');
  }
  bankCheck(p, resource, catalog);
  p.pending = resource;
  return s;
}

/**
 * Gilt die aktuelle Ansage für diesen Spieler als „fremd"? Solo (Deck-Wahl)
 * und Rathaus-Zieh-Runden zählen für alle als fremd; Rathaus-Wahlrunden und
 * die eigene Baumeister-Ansage als eigen.
 */
function isForeignNaming(s: GameState, player: number): boolean {
  if (s.config.townHall) return s.phase.t === 'round' && s.phase.resource != null;
  if (s.config.solo) return true;
  return s.masterBuilder !== player;
}

/** pending verbraucht: ggf. Zusatz-Material (Southern Semaphore) nachrücken. */
function consumePending(p: PlayerState): void {
  p.pending = null;
  p.pendingLocked = false;
  if (p.pendingExtra) {
    p.pending = p.pendingExtra;
    p.pendingExtra = null;
    p.pendingLocked = true; // Zusatz-Material ist nicht tauschbar
  }
}

function requireRound(s: GameState): Resource | null {
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
  // Offizielle Solo-Regel: Fabrik & Co. gelten für die Wahl aus dem Deck
  if (!isForeignNaming(s, player)) fail('Die Fabrik wirkt nur bei fremder Ansage');
  const hasMatch = p.board.some(
    (sq) => sq.building?.marked === named && catalog[sq.building.card]?.effects?.includes('factory')
  );
  if (!hasMatch) fail('Keine Fabrik mit diesem Material');
  p.pending = take;
  return s;
}

/** Fortune: 1 Münze zahlen, um ein beliebiges anderes Material zu nehmen. */
function coinSwap(s: GameState, player: number, take: Resource, catalog: Catalog): GameState {
  const named = requireRound(s);
  if (!s.config.systems.coins) fail('Münzen sind nicht im Spiel');
  const p = activePlayer(s, player);
  if (p.pending !== named || p.pendingLocked) fail('Tausch nur vor dem Platzieren des angesagten Materials');
  if (!isForeignNaming(s, player)) fail('Der Baumeister muss sein angesagtes Material nehmen');
  if (take === named) fail('Bitte ein anderes Material wählen');
  if (p.coins < 1) fail('Keine Münze in der Truhe');
  p.coins--;
  p.pending = take;
  // Southern Semaphore: Münzen dürfen keines der beiden Materialien tauschen —
  // wer tauscht, verzichtet auf das Zusatz-Material (und dessen Münze).
  p.pendingExtra = null;
  // Hollow Hill: jeder Münztausch nach dem Bau kostet 2 Punkte
  if (hasBuiltEffect(p, 'hollowHill', catalog)) {
    p.hollowHillSwaps = (p.hollowHillSwaps ?? 0) + 1;
  }
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
    if (!isForeignNaming(s, player)) fail('Bondmaker wirkt nur bei fremder Ansage');
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
  const sq = p.board[square] ?? fail('Ungültiges Feld');
  const wasExtra = p.pendingLocked === true;

  // Blütenpromenade: solange eigene Münzfelder existieren, MÜSSEN fremd
  // angesagte Materialien dorthin; eigene Ansagen dürfen NICHT auf Münzfelder
  // (außer es gibt kein münzfreies leeres Feld mehr).
  // Solo: die Deck-Wahl gilt als fremde Ansage (wie bei Fabrik und Münztausch).
  if (hasBuiltEffect(p, 'promenadeCoins', catalog)) {
    const coinSquares = p.board.some((c) => c.coin);
    const freeWithoutCoin = p.board.some((c) => !c.building && !c.resource && !c.coin);
    if (isForeignNaming(s, player)) {
      if (coinSquares && !sq.coin) fail('Das Material muss auf ein Münzfeld der Promenade');
    } else if (sq.coin && freeWithoutCoin) {
      fail('Eigene Ansagen dürfen nicht auf Münzfelder der Promenade');
    }
  }

  checkPlacementTarget(s, p, player, square, catalog);
  sq.resource = p.pending;
  consumePending(p);
  p.placedSquare = square;
  // Münze der Promenade: beim Platzieren einsammeln. Grotto-Münzen bleiben
  // liegen — sie teilen sich das Feld mit dem Material und gehören erst dem
  // Gebäude, das dort entsteht.
  if (sq.coin && hasBuiltEffect(p, 'promenadeCoins', catalog)) {
    delete sq.coin;
    gainCoins(p, 1, catalog);
    p.placedCoin = true;
  }
  // Southern Semaphore: das platzierte Zusatz-Material bringt 1 Münze
  if (wasExtra) gainCoins(p, 1, catalog);
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
  if (!isForeignNaming(s, player)) fail('Die eigene Ansage muss platziert werden');
  if ((p.cavernUsed ?? 0) >= 2) fail('Die Höhle ist voll (höchstens 2 pro Partie)');
  p.cavernUsed = (p.cavernUsed ?? 0) + 1;
  consumePending(p); // ein evtl. Zusatz-Material (Semaphor) rückt regulär nach
  p.placedSquare = null;
  return s;
}

/** Eisenbahn: Guards, die Verladen und Tauschen gemeinsam haben. */
function trainAccess(s: GameState, player: number, catalog: Catalog) {
  requireRound(s);
  const p = activePlayer(s, player);
  const train = s.train ?? fail('Die Eisenbahn ist nicht im Spiel');
  if (trainStopPlayer(s, catalog) !== player) fail('Der Zug hält nicht an deinem Bahnhof');
  if (p.trainUsed) fail('Der Zug wurde in dieser Runde bereits genutzt');
  if (p.pending == null) fail('Kein Material zum Verladen');
  return { p, train };
}

/** Eisenbahn: das erhaltene Material in einen freien Waggon legen —
 *  statt es zu platzieren. */
function trainDrop(s: GameState, player: number, catalog: Catalog): GameState {
  const { p, train } = trainAccess(s, player, catalog);
  const w = train.wagons.indexOf(null);
  if (w < 0) fail('Alle Waggons sind voll');
  train.wagons[w] = p.pending!;
  p.trainUsed = true;
  consumePending(p); // ein evtl. Zusatz-Material (Semaphor) rückt regulär nach
  p.placedSquare = null;
  return s;
}

/** Eisenbahn: das erhaltene Material gegen den Inhalt eines Waggons tauschen —
 *  das getauschte Material wird danach normal platziert. */
function trainSwap(s: GameState, player: number, wagon: number, catalog: Catalog): GameState {
  const { p, train } = trainAccess(s, player, catalog);
  if (p.pendingLocked) fail('Das Zusatz-Material kann nicht getauscht werden');
  if (wagon < 0 || wagon >= train.wagons.length) fail('Ungültiger Waggon');
  const held = train.wagons[wagon];
  if (held == null) fail('Dieser Waggon ist leer');
  train.wagons[wagon] = p.pending!;
  p.pending = held;
  p.trainUsed = true;
  return s;
}

/** Unbestätigtes Material dieser Runde verschieben (bis zum „Fertig"). */
function moveResource(s: GameState, player: number, square: number, catalog: Catalog): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.roundDone) fail('Runde bereits beendet');
  if (p.pending != null) fail('Erst das Material platzieren');
  if (p.placedCoin) fail('Das Material hat eine Promenaden-Münze kassiert und bleibt liegen');
  const src = p.placedSquare;
  if (src == null) fail('Kein verschiebbares Material');
  if (src === square) return s;
  const srcSq = p.board[src];
  if (!srcSq?.resource) fail('Material wurde bereits verbaut');
  const sq = p.board[square] ?? fail('Ungültiges Feld');
  if (sq.coin && hasBuiltEffect(p, 'promenadeCoins', catalog)) {
    fail('Auf Münzfelder der Promenade nur direkt beim Platzieren');
  }
  checkPlacementTarget(s, p, player, square, catalog);
  sq.resource = srcSq.resource;
  delete srcSq.resource;
  p.placedSquare = square;
  return s;
}

/** Lagerhaus (max 3) auf dem Feld finden. */
function findStorage(p: PlayerState, square: number, catalog: Catalog) {
  const b = p.board[square]?.building;
  const effects = b ? (catalog[b.card]?.effects ?? []) : [];
  if (!b || !effects.includes('warehouse')) {
    fail('Kein Lager-Gebäude auf diesem Feld');
  }
  b.stored ??= [];
  return { b, cap: 3 };
}

function warehouseStore(s: GameState, player: number, square: number, catalog: Catalog): GameState {
  const named = requireRound(s);
  const p = activePlayer(s, player);
  // Rathaus: das Lagerhaus wirkt nur in Runden mit gezogener Karte
  if (s.config.townHall && named == null) fail('Lagerhaus nur bei gezogenen Karten');
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
  const named = requireRound(s);
  const p = activePlayer(s, player);
  if (s.config.townHall && named == null) fail('Lagerhaus nur bei gezogenen Karten');
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
  gainCoins(p, 1, catalog); // die Münze erhält der nehmende Baumeister (offizielle Regel)
  s.oddityTaken = true;
  return s;
}

/**
 * Fortune, Museum: Liegt das fremd angesagte Material auf dem Museum, darf es
 * statt platziert zu werden in den Vorrat zurückgehen → +1 Münze (1×/Runde).
 */
function museumSell(s: GameState, player: number, square: number, catalog: Catalog): GameState {
  const named = requireRound(s);
  const p = activePlayer(s, player);
  if (p.museumSoldThisRound) fail('Museum bereits in dieser Runde genutzt');
  if (!isForeignNaming(s, player)) fail('Nur bei fremder Ansage möglich');
  if (named == null || p.pending !== named || p.pendingLocked) {
    fail('Nur statt des angesagten Materials möglich');
  }
  const b = p.board[square]?.building;
  if (!b || !catalog[b.card]?.effects?.includes('museum')) fail('Kein Museum hier');
  const i = b.stored?.indexOf(named) ?? -1;
  if (i < 0) fail('Dieses Material liegt nicht auf dem Museum');
  b.stored!.splice(i, 1);
  consumePending(p); // statt zu platzieren; ein Zusatz-Material (Semaphor) rückt nach
  p.placedSquare = null;
  gainCoins(p, 1, catalog);
  p.museumSoldThisRound = true;
  return s;
}

/** Fortune, Museum: nach dem Bau 2 Materialien aus dem Vorrat auflegen. */
function resolveMuseumStock(s: GameState, player: number, resource: Resource): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'museumStock');
  const b = p.board[choice.square]?.building ?? fail('Museum nicht gefunden');
  b.stored ??= [];
  b.stored.push(resource);
  choice.remaining--;
  if (choice.remaining <= 0) removeChoice(p, choice);
  return s;
}

// ---------- Bauen ----------

function build(
  s: GameState, player: number, squares: number[], card: string, target: number,
  catalog: Catalog, prism = false
): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  // „Fertig" ist verbindlich: Danach wartet der Spieler nur noch — sonst könnte
  // ein Bau mit dem Rundenwechsel der anderen kollidieren.
  if (p.roundDone) fail('Runde ist bereits beendet');
  const def = catalog[card] ?? fail('Unbekannte Karte');
  const effects = def.effects ?? [];

  // Prisma-Schmiede: Materialien liegen lassen, damit ein ZWEITES,
  // andersartiges Gebäude sie in derselben Runde mitbenutzen kann
  if (prism) {
    if (!hasBuiltEffect(p, 'prismForge', catalog)) fail('Keine Prisma-Schmiede gebaut');
    if (p.prismUsedThisRound) fail('Prisma-Schmiede bereits in dieser Runde genutzt');
  }
  if (p.prismUsedThisRound && card === p.prismCard) {
    fail('Prisma-Schmiede: Die beiden Gebäude müssen unterschiedlich sein');
  }
  // Estival Festival: Baukosten 2 Münzen (Pflicht)
  if (effects.includes('constructCost2') && p.coins < 2) fail('Der Bau kostet 2 Münzen');
  // Solo-Regel: Der Juwelier braucht die 1 Münze zwingend
  if (s.config.solo && effects.includes('jewelerToll') && p.coins < 1) {
    fail('Solo: Der Juwelier kann nur mit 1 Münze gebaut werden');
  }

  const isMonument = def.kind === 'monument';
  if (isMonument) {
    if (p.monument?.card !== card || p.monument.built) fail('Monument nicht baubar');
  } else if (!s.config.activeCards.includes(card)) {
    fail('Karte ist in dieser Partie nicht im Spiel');
  }

  // Eisenbahn: höchstens ein Bahnhof pro Stadt, und nur an der Strecke
  // (die Gleise verlaufen an der untersten Reihe jeder Stadt)
  if (effects.includes('trainStation')) {
    if (hasStation(p, catalog)) fail('Nur ein Bahnhof pro Stadt');
    if (Math.floor(target / BOARD_SIZE) !== BOARD_SIZE - 1) {
      fail('Der Bahnhof muss an der Strecke liegen (unterste Reihe)');
    }
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

  // Materialien entfernen (Handelsposten bleiben stehen; Prisma: Materialien
  // bleiben für den zweiten Bau liegen und werden danach entfernt)
  if (!prism) {
    for (const i of resourceSquares) delete p.board[i].resource;
    if (p.prismSquares?.length) {
      for (const i of p.prismSquares) delete p.board[i].resource;
      p.prismSquares = undefined;
    }
  } else {
    p.prismUsedThisRound = true;
    p.prismCard = card;
    p.prismSquares = resourceSquares;
  }
  // Beide Prisma-Gebäude entstehen durch Materialentfernen → beide zählen
  // für die Rundenmünze (2+ Bauten).
  p.buildsThisRound++;
  const targetCell = p.board[target];
  targetCell.building = { card };
  // Münze auf dem Bauplatz (Grotto/Promenade) einsammeln
  if (targetCell.coin) {
    delete targetCell.coin;
    gainCoins(p, 1, catalog);
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

  onBuildingPlaced(s, player, card, target, catalog);

  return s;
}

/**
 * Gemeinsame Folgen, wenn ein Gebäude entsteht — beim regulären Bau UND wenn
 * ein Karteneffekt es platziert (Grove, Architektengilde, Opaleye, Steinmetz-
 * gilde, Okaver, Kathedralen-Umbau). Offizielle „Special Note": Auch solche
 * Gebäude bringen ihre Bau-Vorteile.
 */
function onBuildingPlaced(
  s: GameState, player: number, card: string, target: number, catalog: Catalog
): void {
  const p = s.players[player];
  const def = catalog[card] ?? fail('Unbekannte Karte');
  const effects = def.effects ?? [];

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
  if (effects.includes('museum')) {
    p.choices.push({ t: 'museumStock', square: target, remaining: 2 });
  }

  // Opaleyes Wacht der Sitznachbarn: bevorrateten Typ erhalten
  if (def.kind !== 'monument') {
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
}

/** Karteneffekt platziert ein Gebäude: Feld belegen, Münze kassieren, Bau-Folgen. */
function placeBuildingByEffect(
  s: GameState, player: number, card: string, target: number, catalog: Catalog
): void {
  const p = s.players[player];
  // Eisenbahn: auch per Effekt kein zweiter Bahnhof und nur an der Strecke
  if ((catalog[card]?.effects ?? []).includes('trainStation')) {
    if (hasStation(p, catalog)) fail('Nur ein Bahnhof pro Stadt');
    if (Math.floor(target / BOARD_SIZE) !== BOARD_SIZE - 1) {
      fail('Der Bahnhof muss an der Strecke liegen (unterste Reihe)');
    }
  }
  const cell = p.board[target];
  cell.building = { card };
  if (cell.coin) {
    delete cell.coin;
    gainCoins(p, 1, catalog);
  }
  onBuildingPlaced(s, player, card, target, catalog);
}

/** Fortune: Münz-Effekte beim Bau (Reihenfolge: Kosten → Gewinne → Prüfungen). */
function applyCoinEffects(
  s: GameState, p: PlayerState, def: import('./types').CardDef, target: number, catalog: Catalog
): void {
  if (!s.config.systems.coins) return;
  const effects = def.effects ?? [];

  if (effects.includes('constructCost2')) p.coins -= 2; // Deckung vorab geprüft
  if (effects.includes('coinOnConstruct')) gainCoins(p, 1, catalog);
  if (effects.includes('gamblersDen') && p.coins === 1) gainCoins(p, 2, catalog);

  if (effects.includes('statueCoins')) {
    const counts = new Map<string, number>();
    for (const sq of p.board) {
      if (sq.building) counts.set(sq.building.card, (counts.get(sq.building.card) ?? 0) + 1);
    }
    let n = 0;
    for (const c of counts.values()) if (c >= 3) n++;
    gainCoins(p, n, catalog);
  }

  if (effects.includes('windseedCoins')) {
    // +1 Münze je Gebäude des häufigsten eigenen Gebäudetyps
    const counts = new Map<string, number>();
    for (const sq of p.board) {
      if (sq.building) counts.set(sq.building.card, (counts.get(sq.building.card) ?? 0) + 1);
    }
    gainCoins(p, Math.max(0, ...counts.values()), catalog);
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
    gainCoins(p, Math.min(3, Math.max(rowTypes.size, colTypes.size)), catalog);
  }

  if (effects.includes('jewelerToll')) {
    if (p.coins >= 1) p.coins--;
    // Sonst erhalten alle anderen 1 Münze — erst AM RUNDENENDE (auch fertige Städte)
    else for (const o of s.players) if (o !== p) o.pendingCoins = (o.pendingCoins ?? 0) + 1;
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
    // 3 Münzen zahlen ist freiwillig — sonst entsteht das graue Gebäude der Partie
    p.choices.push({ t: 'cathedralChoice', square: target });
  }

  if (effects.includes('grottoCoins')) {
    for (const c of CENTER_SQUARES) {
      const sq = p.board[c];
      if (sq.building) gainCoins(p, 1, catalog); // bebaut (inkl. Grotto selbst) → sofort
      else if (!sq.coin) sq.coin = true;         // Münze teilt sich das Feld ggf. mit Material
    }
  }
}

/** Kathedrale (Fortune): 3 Münzen zahlen ODER das graue Gebäude der Partie bauen. */
function resolveCathedral(
  s: GameState, player: number, pay: boolean, square: number | undefined, catalog: Catalog
): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'cathedralChoice');
  if (pay) {
    if (p.coins < 3) fail('Nicht genug Münzen');
    p.coins -= 3;
    removeChoice(p, choice);
    return s;
  }
  const grayCard = s.config.activeCards.find((c) => catalog[c]?.category === 'well');
  removeChoice(p, choice);
  if (!grayCard) return s; // kein graues Gebäude in dieser Partie → Kathedrale bleibt
  const grayDef = catalog[grayCard];
  let target = choice.square;
  // Schuppen & Co.: darf auf ein beliebiges freies Feld ziehen
  if (square != null && square !== choice.square) {
    if (!(grayDef.effects ?? []).includes('buildAnywhereSelf')) fail('Dieses Gebäude bleibt auf dem Feld');
    const sq = p.board[square] ?? fail('Ungültiges Feld');
    if (sq.building || sq.resource) fail('Feld ist belegt');
    target = square;
  }
  delete p.board[choice.square].building;
  // Bau-Folgen des grauen Gebäudes (z. B. Münze der Mine/Statue)
  placeBuildingByEffect(s, player, grayCard, target, catalog);
  return s;
}

/** Okavers Schatzkammer: Truhe auf 4 gefüllt → Gratis-Hütte auf ein freies Feld. */
function resolveOkaver(
  s: GameState, player: number, square: number | null, catalog: Catalog
): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'okaverCottage');
  if (square == null) {
    removeChoice(p, choice);
    return s;
  }
  const sq = p.board[square] ?? fail('Ungültiges Feld');
  if (sq.building || sq.resource) fail('Feld ist belegt');
  removeChoice(p, choice);
  placeBuildingByEffect(s, player, 'cottage', square, catalog);
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
    removeChoice(p, choice);
    placeBuildingByEffect(s, player, card, square!, catalog);
    return s;
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
  s: GameState, player: number, accept: boolean, square: number | undefined, catalog: Catalog
): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'opaleyeClaim');
  if (accept) {
    const sq = p.board[square ?? -1] ?? fail('Ungültiges Feld');
    if (sq.building || sq.resource) fail('Feld ist belegt');
    const stock = p.board[choice.square].building?.stock;
    if (stock) stock.splice(stock.indexOf(choice.card), 1);
    removeChoice(p, choice);
    placeBuildingByEffect(s, player, choice.card, square!, catalog);
    return s;
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
  choice.picked.push(card);
  if (p.coins === 0) removeChoice(p, choice);
  placeBuildingByEffect(s, player, card, square!, catalog);
  return s;
}

/** Petal Promenade: Münzen auf 3 leere Felder legen (Pflicht, solange Felder frei sind). */
function resolvePromenade(s: GameState, player: number, square: number | null): GameState {
  const p = s.players[player] ?? fail('Unbekannter Spieler');
  const choice = takeChoice(p, 'promenadeCoins');
  const hasFree = p.board.some((sq) => !sq.building && !sq.resource && !sq.coin);
  if (square == null) {
    // Abbrechen nur, wenn kein geeignetes Feld mehr existiert
    if (hasFree) fail('Es müssen 3 Münzen auf leere Felder gelegt werden');
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
  const named = requireRound(s);
  const p = activePlayer(s, player);
  // Southern Semaphore: das Zusatz-Material ist freiwillig — „Fertig" verzichtet darauf
  if (p.pending != null && p.pendingLocked) {
    p.pending = null;
    p.pendingLocked = false;
  }
  if (p.pending != null) fail('Erst das Material platzieren');
  // Rathaus-Wahlrunde: Wählen und Platzieren ist Pflicht — außer für Fort
  // Eisenkraut (setzt aus) oder wenn kein freies Feld mehr existiert
  if (
    s.config.townHall && named == null && p.placedSquare == null &&
    !hasFortIronweed(p, catalog) &&
    p.board.some((sq) => !sq.building && !sq.resource)
  ) {
    fail('Erst ein Material wählen und platzieren');
  }
  if (p.choices.length > 0) fail('Erst offene Entscheidungen klären');
  cleanupPrismLeftovers(p);
  p.roundDone = true;
  p.placedSquare = null;
  return maybeAdvance(s, catalog);
}

/** Prisma-Schmiede: blieb der zweite Bau aus, werden die liegen gelassenen
 *  Materialien am Rundenende doch entfernt (sie sind verbaut). */
function cleanupPrismLeftovers(p: PlayerState): void {
  if (!p.prismSquares?.length) return;
  for (const i of p.prismSquares) delete p.board[i].resource;
  p.prismSquares = undefined;
}

function declareComplete(s: GameState, player: number, catalog: Catalog): GameState {
  requireRound(s);
  const p = activePlayer(s, player);
  if (p.board.some((sq) => !sq.building && !sq.resource)) fail('Es gibt noch freie Felder');
  cleanupPrismLeftovers(p);
  p.done = true;
  p.finishRound = s.round;
  p.pending = null;
  p.placedSquare = null;
  p.roundDone = true;
  p.choices = [];
  return maybeAdvance(s, catalog);
}

/** Fortune: am Rundenende 1 Münze für 2+ Bauten sowie aufgeschobene Münzen (Juwelier). */
function awardRoundCoins(s: GameState, catalog: Catalog): void {
  if (!s.config.systems.coins) return;
  for (const p of s.players) {
    if (p.buildsThisRound >= 2) gainCoins(p, 1, catalog);
    p.buildsThisRound = 0;
    if (p.pendingCoins) {
      gainCoins(p, p.pendingCoins, catalog);
      p.pendingCoins = 0;
    }
  }
}

function maybeAdvance(s: GameState, catalog: Catalog): GameState {
  const active = s.players.filter((p) => !p.done);
  if (active.length === 0) {
    awardRoundCoins(s, catalog);
    s.phase = { t: 'gameOver' };
    return s;
  }
  const allDone = s.players.every((p) => p.roundDone && p.choices.length === 0);
  if (!allDone) return s;

  awardRoundCoins(s, catalog);
  // Eisenbahn: der Zug fährt eine Position weiter (Städte im Uhrzeigersinn,
  // solo mit Tunnel-Segmenten)
  if (s.train) s.train.pos = (s.train.pos + 1) % trainCycle(s);
  // Rathaus: der Bürgermeister bleibt derselbe — es gibt keinen Baumeister
  if (!s.config.townHall) s.masterBuilder = nextMasterBuilder(s, catalog);
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
