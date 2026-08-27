// Reine Typdefinitionen der Spiel-Engine — kein DOM, kein Svelte.

export type Resource = 'wood' | 'brick' | 'stone' | 'wheat' | 'glass';
export const RESOURCES: Resource[] = ['wood', 'brick', 'stone', 'wheat', 'glass'];

/** Zelle eines Baumusters: Ressource oder leer (null). */
export type PatternCell = Resource | null;
export type Pattern = PatternCell[][];

export type CardKind = 'cottage' | 'building' | 'monument';
export type Category =
  | 'cottage' | 'food' | 'well' | 'chapel'
  | 'theater' | 'tavern' | 'factory' | 'monument';
export type CardColor =
  | 'blue' | 'red' | 'grey' | 'orange'
  | 'yellow' | 'green' | 'black' | 'pink';

export interface I18nText {
  de: string;
  en?: string;
  [lang: string]: string | undefined;
}

/** Ziel-Selektor für deklarative Wertungen. */
export type Selector =
  | { color: CardColor }
  | { card: string }
  | 'cottage'      // Hütten-Gebäude (inkl. Barrett Castle, zählt doppelt)
  | 'fedCottage'
  | 'self';        // Gebäude derselben Farbe wie die wertende Karte

export type Zone = 'corners' | 'center4';

export type ScoringSpec =
  | { type: 'none' }
  | { type: 'flat'; vp: number }
  | { type: 'ifFed'; vp: number }
  /** table[i] = Punkte bei (i+1) Exemplaren; darüber: overflow. */
  | { type: 'byCountTable'; table: number[]; overflow: number }
  | { type: 'perAdjacent'; target: Selector; vpEach: number }
  | { type: 'ifAdjacentAny'; targets: Selector[]; vp: number }
  | { type: 'ifNotAdjacentAny'; targets: Selector[]; vp: number }
  | { type: 'ifAdjacentAtLeast'; target: Selector; count: number; vp: number }
  | { type: 'perInTown'; target: Selector; vpEach: number }
  | { type: 'perInZone'; zone: Zone; target: Selector; vpEach: number; base?: number }
  | { type: 'perUniqueTypesInRowCol'; vpEach: number }
  /** Markt: gleiche Karte in Zeile ∪ Spalte, sich selbst 1× mitgezählt (max 7). */
  | { type: 'perSameCardInRowCol'; vpEach: number }
  | { type: 'ifAloneInRowAndCol'; target: Selector; vp: number }
  | { type: 'perOwnCountVsRightNeighbor'; baseEach: number; bonusEach: number }
  | { type: 'perStoredResource'; vpEach: number }
  /** Landpartie: Punkte je angrenzendem Landschaftsfeld der genannten Arten. */
  | { type: 'perAdjacentTerrain'; terrains: TerrainKind[]; vpEach: number }
  /** Landpartie: Punkte, wenn mindestens eines der genannten Landschaftsfelder angrenzt. */
  | { type: 'ifAdjacentTerrain'; terrains: TerrainKind[]; vp: number }
  /** Sonderwertungen (Monumente), implementiert in scoring.ts. */
  | { type: 'handler'; handler: ScoreHandlerId; vp?: number };

export type ScoreHandlerId =
  | 'archive'        // 1 SP je einzigartigem Gebäudetyp (ohne Monumente)
  | 'mandras'        // 2 SP je einzigartigem angrenzendem Gebäudetyp
  | 'skyBaths'       // 2 SP je fehlendem Gebäudetyp
  | 'silva'          // 1 SP + 1 SP je Gebäude der größten zusammenhängenden Gruppe
  | 'shrine'         // Tabelle nach Gebäudezahl zum Bauzeitpunkt
  | 'starloom'       // Punkte nach Fertigstellungs-Reihenfolge
  | 'schoolhouse'    // Fortune: 2 SP bei gefütterter Nachbar-Hütte, +2 bei Münzen ≥ rechter Nachbar
  | 'eraflage'       // Fortune: 9 SP wenn gefüttert, −2 SP je Gebäudetyp in Zeile ∪ Spalte
  | 'hollowHill';    // Fortune: 7 SP, −2 je Münztausch nach dem Bau

/** Spiellogik-Effekte, implementiert in effects.ts / game.ts. */
export type EffectId =
  | 'factory'            // Material merken; Tausch, wenn andere es ansagen
  | 'bank'               // Material sperren: darf es selbst nie ansagen
  | 'tradingPost'        // zählt beim Bauen als beliebiges Material
  | 'warehouse'          // Material einlagern/tauschen (max 3), -1 SP je Inhalt
  | 'buildAnywhereSelf'  // Schuppen: selbst auf beliebigem leeren Feld baubar
  | 'buildAnywhereAll'   // Obelisk: ALLE künftigen Gebäude auf beliebigem leeren Feld
  | 'architectsGuild'    // beim Bau: bis zu 2 Gebäude durch andere Typen ersetzen
  | 'groveUniversity'    // beim Bau: 1 Gebäude aus dem Vorrat gratis platzieren
  | 'opaleye'            // 3 Typen bevorraten; erhalten, wenn Nachbarn sie bauen
  | 'bondmaker'          // angesagte Materialien auf Hütten lagern (nie verbaubar)
  | 'fortIronweed'       // keine Master-Builder-Züge mehr
  | 'cathedral'          // leere Felder 0 statt -1
  | 'mausoleum'          // ungefütterte Hütten 3 SP
  | 'barrettCastle'      // zählt als 2 (gefütterte) Hütten für alle Wertungen
  // ---------- Fortune ----------
  | 'coinOnConstruct'    // Bau: +1 Münze (Mine, Root Cellar)
  | 'statueCoins'        // Bau: +1 Münze je Gebäudetyp mit 3+ Exemplaren
  | 'gamblersDen'        // Bau: +2 Münzen bei genau 1 Münze
  | 'teahouseCoins'      // Bau: +1 Münze je Typ in Zeile ODER Spalte (max 3)
  | 'jewelerToll'        // Bau: 1 Münze zahlen, sonst +1 Münze für alle anderen
  | 'parsonageCheck'     // Bau: Münzen ≠ Hüttenzahl → alle Münzen verlieren
  | 'constructCost2'     // Bau kostet 2 Münzen (Pflicht)
  | 'coinValue2'         // Endwertung: Münzen 2 statt 1 SP (Estival Festival)
  | 'masonsGuild'        // Bau: je 1 Münze → 1 weiteres (einzigartiges) Gebäude
  | 'oddityShop'         // hält 1 fremd angesagtes Material; nehmender Baumeister erhält 1 Münze
  | 'museum'             // Bau: 2 Materialien darauf legen; passende Ansage → zurückgeben statt platzieren, +1 Münze
  | 'cathedralTransform' // Bau: 3 Münzen zahlen ODER stattdessen das graue Gebäude der Partie bauen
  | 'grottoCoins'        // Bau: Münze auf jedes der 4 Mittelfelder (bebaute sofort kassieren)
  | 'promenadeCoins'     // Bau: Münzen auf 3 freie Felder; die nächsten 3 fremden Ansagen MÜSSEN dorthin
  | 'prismForge'         // 2 einzigartige Gebäude mit überlappenden Mustern in derselben Runde
  | 'southernSemaphore'  // fremde Ansage: 1 Zusatz-Material desselben Typs, dafür +1 Münze
  | 'windseedCoins'      // Bau: +1 Münze je Gebäude des häufigsten eigenen Gebäudetyps
  | 'okaverCottage'      // Truhe auf 4 Münzen gefüllt → Hütte auf ein beliebiges freies Feld
  | 'hollowHill'         // Marker: nach dem Bau kostet jeder Münztausch −2 SP
  | 'fedMonument'        // Monument will wie eine Hütte gefüttert werden (Eraflage)
  | 'coinSlot'           // gebautes Monument: +1 Truhenplatz (Truhe fasst 5)
  // ---------- Eisenbahn (eigener Modus) ----------
  | 'trainStation';      // Bahnhof: der Zug hält hier (max. 1 pro Stadt)

export interface FeedingSpec {
  mode:
    | 'anywhere' | 'surrounding8' | 'rowAndColumn' | 'contiguousGroup'
    // Fortune (münzbasiert, Endwertung):
    | 'rowOrColumnPerCoin'         // Root Cellar: 1 Münze je gewählter Zeile/Spalte
    | 'adjacentPlusPerCoinPer2';   // Tithe Barn: Nachbarn gratis + 1 Münze je 2 Hütten
  count?: number; // nur mode=anywhere (Farm: 4)
}

/** Symbol-Features für die Mini-Kartenansicht. */
export type FeatureId =
  | 'feedable' | 'feeds' | 'adjacency' | 'no-adjacency' | 'row-col' | 'corners' | 'center'
  | 'count-table' | 'holds-resource' | 'wild-resource' | 'interactive'
  | 'on-construct' | 'placement-override' | 'negative-vp' | 'vs-neighbor'
  | 'town-snapshot' | 'finish-order' | 'empty-ok' | 'unique-types' | 'coins';

export interface CardDef {
  id: string;
  set: string;
  kind: CardKind;
  category: Category;
  color: CardColor;
  name: I18nText;
  text: I18nText;
  pattern: Pattern;
  features: FeatureId[];
  feeding?: FeedingSpec;
  scoring: ScoringSpec;
  effects?: EffectId[];
  art?: string;
  /** Kartentext/-muster nicht aus Primärquellen verifiziert (siehe schema.md). */
  unverified?: boolean;
  /** Themes (reine Anzeige): andere Namen/Texte/Artworks bei identischen Regeln. */
  themes?: Record<string, { name: I18nText; text: I18nText; art?: string }>;
}

export type Catalog = Record<string, CardDef>;

// ---------- Spielzustand ----------

/** Klassische Brettgröße. Die Landpartie spielt auf 6×6 — überall dort, wo es
 *  auf die Größe ankommt, gilt deshalb die des konkreten Bretts (boardSizeOf),
 *  und diese Konstante ist nur noch der Default. */
export const BOARD_SIZE = 4;
export const NUM_SQUARES = BOARD_SIZE * BOARD_SIZE;

/** Kantenlänge eines konkreten Bretts — selbstbeschreibend aus der Feldzahl,
 *  damit alte Spielstände ohne Migrationsfeld weiterlaufen. */
export const boardSizeOf = (board: unknown[]): number => Math.round(Math.sqrt(board.length));

export interface PlacedBuilding {
  card: string;
  /** Fabrik/Bank: markiertes Material. */
  marked?: Resource;
  /** Lagerhaus: eingelagerte Materialien (max 3). */
  stored?: Resource[];
  /** Opaleyes Wacht: bevorratete Gebäudetypen. */
  stock?: string[];
}

/** Landschaftsfelder der Landpartie — unbebaubar, aber wertungsrelevant. */
export type TerrainKind = 'river' | 'mountain' | 'lake';

export interface Square {
  building?: PlacedBuilding;
  /** Material; koexistiert mit building nur via Statue des Bondmakers. */
  resource?: Resource;
  /** Fortune: Münze auf dem Feld (Grotto/Promenade). */
  coin?: boolean;
  /** Landpartie: Landschaft (Fluss/Berg/See) — Feld ist nie bebaubar. */
  terrain?: TerrainKind;
}

/** Gesperrtes Feld (Landschaft): kein Material, kein Gebäude, keine Münze. */
export const isBlocked = (sq: Square): boolean => !!sq.terrain;
/** Wirklich freies Feld — die eine Definition für alle „ist da Platz?"-Fragen. */
export const isFreeSquare = (sq: Square): boolean =>
  !sq.building && !sq.resource && !sq.terrain;

export interface PlayerState {
  name: string;
  /** Ecke 0=unten links, 1=unten rechts, 2=oben rechts, 3=oben links. */
  corner: number;
  board: Square[]; // Länge size², Index = row*size+col (klassisch 4, Landpartie 6)
  /** Beim Draft: die 2 zugeteilten Monumente; nach Wahl geleert. */
  monumentOptions?: string[];
  monument?: { card: string; built: boolean };
  /** Ausstehendes Material dieser Runde (null = bereits platziert). */
  pending?: Resource | null;
  /** Feld des in dieser Runde platzierten, noch unbestätigten Materials —
   *  bis zum „Fertig" darf es noch verschoben werden. */
  placedSquare?: number | null;
  /** Runde beendet (nach Platzieren + optionalem Bauen). */
  roundDone: boolean;
  /** Stadt fertig — nimmt nicht mehr teil. */
  done: boolean;
  /** Runde, in der die Stadt fertig wurde (Starloom; Gleichstand = gleiche Runde). */
  finishRound?: number;
  /** Gebäudezahl beim Bau des Schreins. */
  shrineSnapshot?: number;
  masterBuilderTurns: number;
  choices: PendingChoice[];
  /** Münzen in der Truhe (Fortune, 0–COIN_CAP). */
  coins: number;
  /** Bauten durch Materialentfernen in dieser Runde (Fortune: 2+ → 1 Münze). */
  buildsThisRound: number;
  /** Tiny Trees: Feld des Samens (-1 = verbraucht, undefined = System inaktiv/ungesetzt). */
  seedSquare?: number;
  /** Fortune: zusätzliches Material (Southern Semaphore); rückt nach dem Platzieren in pending nach. */
  pendingExtra?: Resource | null;
  /** Höhlen-Regel: bereits beiseitegelegte Materialien (max. 2 pro Partie). */
  cavernUsed?: number;
  /** Fortune: pending stammt aus Southern Semaphore → kein Tausch (Fabrik/Münze) erlaubt. */
  pendingLocked?: boolean;
  /** Fortune: Museum-Verkauf bereits in dieser Runde genutzt. */
  museumSoldThisRound?: boolean;
  /** Fortune: Prisma-Schmiede in dieser Runde genutzt (+ Karte der Erstnutzung). */
  prismUsedThisRound?: boolean;
  prismCard?: string;
  /** Fortune, Prisma: Materialfelder des Prisma-Baus — Reste werden nach dem 2. Bau entfernt. */
  prismSquares?: number[];
  /** Fortune, Hollow Hill: Münztausche nach dem Bau (je −2 SP). */
  hollowHillSwaps?: number;
  /** Fortune, Juwelier: Münzen, die erst am Rundenende gutgeschrieben werden. */
  pendingCoins?: number;
  /** Fortune, Promenade: das platzierte Material hat eine Münze kassiert (nicht mehr verschiebbar). */
  placedCoin?: boolean;
  /** Eisenbahn: Zug-Aktion (Verladen/Tauschen) in dieser Runde bereits genutzt. */
  trainUsed?: boolean;
}

export type PendingChoice =
  | { t: 'markResource'; square: number; card: string }              // Fabrik/Bank nach Bau
  | { t: 'groveUniversity'; square: number }                          // Gratis-Gebäude wählen
  | { t: 'architectsGuild'; square: number; remaining: number }       // bis zu 2 Ersetzungen
  | { t: 'opaleyeSetup'; square: number; remaining: number }          // 3 Typen bevorraten
  | { t: 'opaleyeClaim'; square: number; card: string }               // Nachbar baute Vorratstyp
  | { t: 'masonsGuild'; square: number; picked: string[] }            // Fortune: Münzen → Gebäude
  | { t: 'promenadeCoins'; remaining: number }                        // Fortune: Münzen auf Felder
  | { t: 'museumStock'; square: number; remaining: number }           // Fortune: 2 Materialien aufs Museum
  | { t: 'cathedralChoice'; square: number }                          // Fortune: 3 Münzen zahlen oder umwandeln
  | { t: 'okaverCottage' }                                            // Fortune: Truhe voll → Gratis-Hütte
  | { t: 'seedBonus' };                                               // Tiny Trees: Gratis-Material

export type Phase =
  | { t: 'monumentDraft' }
  | { t: 'seedPlacement' }   // Tiny Trees: jeder wählt ein Feld für seinen Samen
  | { t: 'nameResource' }
  /** resource = null: Rathaus-Runde mit freier Materialwahl (jede 3. Runde). */
  | { t: 'round'; resource: Resource | null }
  | { t: 'gameOver' };

export interface GameConfig {
  players: { name: string; corner: number }[];
  /** Die 7 aktiven Karten (cottage + 1 je Kategorie). */
  activeCards: string[];
  /** Zuordnung Spieler → 2 Monument-Optionen. */
  monumentDeals: string[][];
  firstMasterBuilder: number;
  useMonuments: boolean;
  /** Solo-Modus (offizielle Variante): Material kommt aus einem Kartendeck. */
  solo?: boolean;
  /** Solo: gemischtes Material-Deck (15 Karten, 3 je Material), Index 0 = oben. */
  soloDeck?: Resource[];
  /** Rathaus-Modus (offizielle Variante): kein Baumeister, Materialdeck + freie Wahl jede 3. Runde. */
  townHall?: boolean;
  /** Rathaus: gemischtes Material-Deck (15 Karten, 3 je Material), Index 0 = oben. */
  townHallDeck?: Resource[];
  /** Rathaus: Seed für deterministische Neumischungen des Abwurfstapels. */
  thSeed?: number;
  /** Landpartie: 6×6-Brett mit Landschaft (nur solo). */
  land?: boolean;
  /** Landpartie: die Landschaftsfelder (aus dem Seed erzeugt, Teil des Setups). */
  terrain?: { square: number; kind: TerrainKind }[];
  /** Tages-Challenge: Datum des festen Seeds (z. B. „2026-08-23"). */
  dailyId?: string;
  /** Eindeutige Partie-Kennung (Bestenliste: jede Partie zählt nur einmal). */
  gameId?: string;
  /** Aktive Karten-Sets (enthält immer 'base'). */
  sets: string[];
  /** Aktive Zusatzsysteme (aus den gewählten Sets abgeleitet). */
  systems: { coins: boolean; trees: boolean; cavern?: boolean; train?: boolean };
  /** Eisenbahn: zufällige Startposition des Zugs (seedbar). */
  trainStart?: number;
}

/** Maximale Münzen in der Truhe (Fortune). */
export const COIN_CAP = 4;

export interface GameState {
  /** Solo: verdeckter Nachziehstapel (Index 0 = oben). */
  soloDeck?: Resource[];
  /** Solo: die 3 offen ausliegenden Material-Karten. */
  soloOffer?: Resource[];
  /** Rathaus: verdeckter Nachziehstapel (Index 0 = oben). */
  thDeck?: Resource[];
  /** Rathaus: Abwurfstapel (inkl. der 5 anfangs verdeckt abgeworfenen Karten). */
  thDiscard?: Resource[];
  /** Rathaus: Anzahl bisheriger Neumischungen (macht den Reshuffle deterministisch). */
  thShuffles?: number;
  config: GameConfig;
  players: PlayerState[];
  phase: Phase;
  masterBuilder: number;
  round: number;
  /** Fortune: Oddity-Shop-Zugriff des aktuellen Baumeisters bereits genutzt. */
  oddityTaken?: boolean;
  /** Eisenbahn: Position auf dem Rundkurs (pos < Spielerzahl: hält bei dieser
   *  Stadt, sonst Tunnel) und die 3 Waggons (null = leer). */
  train?: { pos: number; wagons: (Resource | null)[] };
  /** Version des Save-Formats. */
  v: number;
}

export type Action =
  | { t: 'chooseMonument'; player: number; card: string }
  | { t: 'nameResource'; resource: Resource }
  | { t: 'soloPick'; index: number }
  | { t: 'townHallDraw' }
  | { t: 'townHallPick'; player: number; resource: Resource }
  | { t: 'factorySwap'; player: number; take: Resource }
  | { t: 'coinSwap'; player: number; take: Resource }
  | { t: 'placeResource'; player: number; square: number }
  | { t: 'cavern'; player: number }
  | { t: 'moveResource'; player: number; square: number }
  | { t: 'warehouseStore'; player: number; square: number }
  | { t: 'warehouseSwap'; player: number; square: number; storedIndex: number }
  | { t: 'build'; player: number; squares: number[]; card: string; target: number; prism?: boolean }
  | { t: 'oddityStore'; player: number; square: number }
  | { t: 'oddityTake'; player: number; fromPlayer: number; fromSquare: number; targetSquare: number }
  | { t: 'museumSell'; player: number; square: number }
  | { t: 'resolveMasons'; player: number; card: string | null; square?: number }
  | { t: 'resolvePromenade'; player: number; square: number | null }
  | { t: 'resolveMuseumStock'; player: number; resource: Resource }
  | { t: 'resolveCathedral'; player: number; pay: boolean; square?: number }
  | { t: 'resolveOkaver'; player: number; square: number | null }
  | { t: 'resolveSeedBonus'; player: number; resource: Resource | null; square?: number }
  | { t: 'placeSeed'; player: number; square: number }
  | { t: 'resolveMark'; player: number; resource: Resource }
  | { t: 'resolveGrove'; player: number; card: string | null; square?: number }
  | { t: 'resolveGuild'; player: number; square: number | null; newCard?: string }
  | { t: 'resolveOpaleyeSetup'; player: number; card: string | null }
  | { t: 'resolveOpaleyeClaim'; player: number; accept: boolean; square?: number }
  | { t: 'trainDrop'; player: number }
  | { t: 'trainSwap'; player: number; wagon: number }
  | { t: 'roundDone'; player: number }
  | { t: 'declareComplete'; player: number };

export interface ScoreLine {
  card: string;
  count: number;
  points: number;
}

export interface PlayerScore {
  lines: ScoreLine[];
  emptySquares: number;
  emptyPenalty: number;
  total: number;
  fedCottages: number;
  /** Fortune: übrige Münzen und ihre Punkte (nach Fütterungs-Ausgaben). */
  coins?: { count: number; spent: number; points: number };
  /** Tiny Trees: 2 Punkte, wenn der Samen zum Baum wurde. */
  treePoints?: number;
}

// ---------- Hilfsfunktionen ----------

// Alle Geometrie-Helfer nehmen die Kantenlänge als letzten Parameter mit
// Default BOARD_SIZE: Bestehende Aufrufer (und Tests) bleiben wortgleich
// gültig, und die Landpartie reicht ihre 6 durch.
export const idx = (row: number, col: number, n = BOARD_SIZE): number => row * n + col;
export const rowOf = (i: number, n = BOARD_SIZE): number => Math.floor(i / n);
export const colOf = (i: number, n = BOARD_SIZE): number => i % n;

/** Orthogonale Nachbarn eines Feldes. */
export function neighbors4(i: number, n = BOARD_SIZE): number[] {
  const r = rowOf(i, n), c = colOf(i, n), out: number[] = [];
  if (r > 0) out.push(idx(r - 1, c, n));
  if (r < n - 1) out.push(idx(r + 1, c, n));
  if (c > 0) out.push(idx(r, c - 1, n));
  if (c < n - 1) out.push(idx(r, c + 1, n));
  return out;
}

/** Alle 8 umliegenden Felder. */
export function neighbors8(i: number, n = BOARD_SIZE): number[] {
  const r = rowOf(i, n), c = colOf(i, n), out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(idx(nr, nc, n));
    }
  return out;
}

/** Die vier Eckfelder (Kloster). */
export const cornerSquares = (n = BOARD_SIZE): number[] =>
  [idx(0, 0, n), idx(0, n - 1, n), idx(n - 1, 0, n), idx(n - 1, n - 1, n)];
/** Die vier Mittelfelder (Schneiderei, Grotte) — bei gerader Kantenlänge
 *  das exakte Zentrum, klassisch [5, 6, 9, 10]. */
export function centerSquares(n = BOARD_SIZE): number[] {
  const a = Math.floor((n - 1) / 2), b = Math.ceil((n - 1) / 2);
  return [idx(a, a, n), idx(a, b, n), idx(b, a, n), idx(b, b, n)].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );
}
