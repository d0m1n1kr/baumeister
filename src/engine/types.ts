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
  /** Sonderwertungen (Monumente), implementiert in scoring.ts. */
  | { type: 'handler'; handler: ScoreHandlerId; vp?: number };

export type ScoreHandlerId =
  | 'archive'        // 1 SP je einzigartigem Gebäudetyp (ohne Monumente)
  | 'mandras'        // 2 SP je einzigartigem angrenzendem Gebäudetyp
  | 'skyBaths'       // 2 SP je fehlendem Gebäudetyp
  | 'silva'          // 1 SP + 1 SP je Gebäude der größten zusammenhängenden Gruppe
  | 'shrine'         // Tabelle nach Gebäudezahl zum Bauzeitpunkt
  | 'starloom';      // Punkte nach Fertigstellungs-Reihenfolge

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
  | 'barrettCastle';     // zählt als 2 (gefütterte) Hütten für alle Wertungen

export interface FeedingSpec {
  mode: 'anywhere' | 'surrounding8' | 'rowAndColumn' | 'contiguousGroup';
  count?: number; // nur mode=anywhere (Farm: 4)
}

/** Symbol-Features für die Mini-Kartenansicht. */
export type FeatureId =
  | 'feedable' | 'feeds' | 'adjacency' | 'no-adjacency' | 'row-col' | 'corners' | 'center'
  | 'count-table' | 'holds-resource' | 'wild-resource' | 'interactive'
  | 'on-construct' | 'placement-override' | 'negative-vp' | 'vs-neighbor'
  | 'town-snapshot' | 'finish-order' | 'empty-ok' | 'unique-types';

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
}

export type Catalog = Record<string, CardDef>;

// ---------- Spielzustand ----------

export const BOARD_SIZE = 4;
export const NUM_SQUARES = BOARD_SIZE * BOARD_SIZE;

export interface PlacedBuilding {
  card: string;
  /** Fabrik/Bank: markiertes Material. */
  marked?: Resource;
  /** Lagerhaus: eingelagerte Materialien (max 3). */
  stored?: Resource[];
  /** Opaleyes Wacht: bevorratete Gebäudetypen. */
  stock?: string[];
}

export interface Square {
  building?: PlacedBuilding;
  /** Material; koexistiert mit building nur via Statue des Bondmakers. */
  resource?: Resource;
}

export interface PlayerState {
  name: string;
  /** Ecke 0=unten links, 1=unten rechts, 2=oben rechts, 3=oben links. */
  corner: number;
  board: Square[]; // Länge 16, Index = row*4+col
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
}

export type PendingChoice =
  | { t: 'markResource'; square: number; card: string }              // Fabrik/Bank nach Bau
  | { t: 'groveUniversity'; square: number }                          // Gratis-Gebäude wählen
  | { t: 'architectsGuild'; square: number; remaining: number }       // bis zu 2 Ersetzungen
  | { t: 'opaleyeSetup'; square: number; remaining: number }          // 3 Typen bevorraten
  | { t: 'opaleyeClaim'; square: number; card: string };              // Nachbar baute Vorratstyp

export type Phase =
  | { t: 'monumentDraft' }
  | { t: 'nameResource' }
  | { t: 'round'; resource: Resource }
  | { t: 'gameOver' };

export interface GameConfig {
  players: { name: string; corner: number }[];
  /** Die 7 aktiven Karten (cottage + 1 je Kategorie). */
  activeCards: string[];
  /** Zuordnung Spieler → 2 Monument-Optionen. */
  monumentDeals: string[][];
  firstMasterBuilder: number;
  useMonuments: boolean;
}

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  phase: Phase;
  masterBuilder: number;
  round: number;
  /** Version des Save-Formats. */
  v: number;
}

export type Action =
  | { t: 'chooseMonument'; player: number; card: string }
  | { t: 'nameResource'; resource: Resource }
  | { t: 'factorySwap'; player: number; take: Resource }
  | { t: 'placeResource'; player: number; square: number }
  | { t: 'moveResource'; player: number; square: number }
  | { t: 'warehouseStore'; player: number; square: number }
  | { t: 'warehouseSwap'; player: number; square: number; storedIndex: number }
  | { t: 'build'; player: number; squares: number[]; card: string; target: number }
  | { t: 'resolveMark'; player: number; resource: Resource }
  | { t: 'resolveGrove'; player: number; card: string | null; square?: number }
  | { t: 'resolveGuild'; player: number; square: number | null; newCard?: string }
  | { t: 'resolveOpaleyeSetup'; player: number; card: string | null }
  | { t: 'resolveOpaleyeClaim'; player: number; accept: boolean; square?: number }
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
}

// ---------- Hilfsfunktionen ----------

export const idx = (row: number, col: number): number => row * BOARD_SIZE + col;
export const rowOf = (i: number): number => Math.floor(i / BOARD_SIZE);
export const colOf = (i: number): number => i % BOARD_SIZE;

/** Orthogonale Nachbarn eines Feldes. */
export function neighbors4(i: number): number[] {
  const r = rowOf(i), c = colOf(i), out: number[] = [];
  if (r > 0) out.push(idx(r - 1, c));
  if (r < BOARD_SIZE - 1) out.push(idx(r + 1, c));
  if (c > 0) out.push(idx(r, c - 1));
  if (c < BOARD_SIZE - 1) out.push(idx(r, c + 1));
  return out;
}

/** Alle 8 umliegenden Felder. */
export function neighbors8(i: number): number[] {
  const r = rowOf(i), c = colOf(i), out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) out.push(idx(nr, nc));
    }
  return out;
}

export const CORNER_SQUARES = [0, 3, 12, 15];
export const CENTER_SQUARES = [5, 6, 9, 10];
