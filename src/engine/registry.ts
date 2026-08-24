// Kartenkatalog: Validierung der JSON-Assets + zufälliges Partie-Setup.

import type { CardDef, Catalog, Category, GameConfig, Resource } from './types';

export const CATEGORY_ORDER: Category[] = [
  'cottage', 'food', 'well', 'chapel', 'theater', 'tavern', 'factory'
];

export class AssetError extends Error {}

export function validateCard(def: CardDef): void {
  const err = (m: string) => { throw new AssetError(`Karte "${def?.id ?? '?'}": ${m}`); };
  if (!def.id || !/^[a-z0-9_]+$/.test(def.id)) err('ungültige id');
  if (!def.name?.de) err('name.de fehlt');
  if (!def.text?.de) err('text.de fehlt');
  if (!Array.isArray(def.pattern) || def.pattern.length === 0) err('pattern fehlt');
  const w = def.pattern[0].length;
  if (w === 0 || def.pattern.some((row) => row.length !== w)) err('pattern nicht rechteckig');
  if (!def.pattern.flat().some((c) => c !== null)) err('pattern ist leer');
  if (def.pattern.length > 4 || w > 4) err('pattern größer als das Brett');
  if (!def.scoring?.type) err('scoring fehlt');
  if (def.kind === 'monument' && def.category !== 'monument') err('Monument braucht category "monument"');
  if (def.kind !== 'monument' && def.category === 'monument') err('category "monument" nur für Monumente');
}

export function buildCatalog(defs: CardDef[]): Catalog {
  const catalog: Catalog = {};
  for (const def of defs) {
    validateCard(def);
    if (catalog[def.id]) throw new AssetError(`Doppelte Karten-id "${def.id}"`);
    catalog[def.id] = def;
  }
  return catalog;
}

// ---------- Zufall (seedbar, für reproduzierbare Tests) ----------

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

export function shuffled<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Partie-Setup ----------

/** Ecken im Uhrzeigersinn (von oben betrachtet): unten links → oben links → oben rechts → unten rechts. */
const CLOCKWISE_CORNERS = [0, 3, 2, 1];

/**
 * Spieler in Sitzreihenfolge (im Uhrzeigersinn) bringen. Die Reihenfolge legt die
 * Spielerindizes fest — im Mehrgerätemodus müssen Sitzplätze dieselbe Ordnung nutzen.
 */
export function sortPlayersClockwise<T extends { corner: number }>(players: T[]): T[] {
  return [...players].sort(
    (a, b) => CLOCKWISE_CORNERS.indexOf(a.corner) - CLOCKWISE_CORNERS.indexOf(b.corner)
  );
}

/** Offizielle Solo-Regel: Karten, die sich auf Mitspieler beziehen, fliegen raus. */
export const SOLO_EXCLUDED = [
  'inn', 'bank', 'fort_ironweed', 'opaleyes_watch',
  // Fortune (offizielle Solo-Regel): interaktive Karten bleiben draußen
  'oddity_shop', 'schoolhouse', 'southern_semaphore'
];

/** Offizielle Rathaus-Regel (Fortune): der Kuriositätenladen bleibt draußen. */
export const TOWNHALL_EXCLUDED = ['oddity_shop'];

const RESOURCES: Resource[] = ['wood', 'brick', 'stone', 'wheat', 'glass'];

export function randomSetup(
  catalog: Catalog,
  playersInput: { name: string; corner: number }[],
  useMonuments: boolean,
  rng: Rng,
  sets: string[] = ['base'],
  systems: { coins?: boolean; trees?: boolean; cavern?: boolean } = {},
  solo = false,
  townHall = false,
  train = false
): GameConfig {
  // Spielerreihenfolge = Sitzreihenfolge im Uhrzeigersinn, damit der
  // Baumeister im Uhrzeigersinn weiterwandert.
  const players = sortPlayersClockwise(playersInput);
  if (!sets.includes('base')) sets = ['base', ...sets];
  // Erweiterungskarten werden laut Anleitung einfach in die Stapel gemischt.
  const defs = Object.values(catalog).filter(
    (d) => sets.includes(d.set) &&
      !(solo && SOLO_EXCLUDED.includes(d.id)) &&
      !(townHall && TOWNHALL_EXCLUDED.includes(d.id))
  );
  const activeCards: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const pool = defs.filter((d) => d.kind !== 'monument' && d.category === cat);
    if (pool.length === 0) throw new AssetError(`Keine Karten in Kategorie "${cat}"`);
    activeCards.push(pool[Math.floor(rng() * pool.length)].id);
  }
  // Eisenbahn: der Bahnhof liegt als 8. Karte für alle aus (set 'internal',
  // taucht daher nie in den Kategorie-Pools auf)
  if (train) activeCards.push('train_station');

  const monumentDeals: string[][] = [];
  if (useMonuments) {
    const monuments = shuffled(defs.filter((d) => d.kind === 'monument').map((d) => d.id), rng);
    if (monuments.length < players.length * 2) {
      throw new AssetError('Zu wenige Monumentkarten für diese Spielerzahl');
    }
    for (let i = 0; i < players.length; i++) {
      monumentDeals.push([monuments[i * 2], monuments[i * 2 + 1]]);
    }
  } else {
    for (let i = 0; i < players.length; i++) monumentDeals.push([]);
  }

  return {
    players,
    activeCards,
    monumentDeals,
    firstMasterBuilder: Math.floor(rng() * players.length),
    useMonuments,
    solo,
    // Solo: 15 Material-Karten (3 je Material) mischen — seedbar, also auch
    // als Tages-Challenge für alle gleich.
    soloDeck: solo
      ? shuffled(RESOURCES.flatMap((r) => [r, r, r]), rng)
      : undefined,
    townHall: townHall || undefined,
    townHallDeck: townHall
      ? shuffled(RESOURCES.flatMap((r) => [r, r, r]), rng)
      : undefined,
    thSeed: townHall ? Math.floor(rng() * 0xffffffff) : undefined,
    // Eisenbahn: zufällige Startposition auf dem Rundkurs
    // (Zyklus = Spielerzahl + 1 Tunnel-Segment, mindestens 3 — wie trainCycle)
    trainStart: train
      ? Math.floor(rng() * Math.max(players.length + 1, 3))
      : undefined,
    sets,
    systems: {
      coins: systems.coins ?? false,
      trees: systems.trees ?? false,
      cavern: systems.cavern ?? false,
      train
    }
  };
}

/** Offizielle Solo-Rangtabelle: Index (0 = bester Rang) für die i18n-Anzeige. */
export function soloRankIndex(score: number): number {
  if (score >= 38) return 0;
  if (score >= 32) return 1;
  if (score >= 25) return 2;
  if (score >= 18) return 3;
  if (score >= 10) return 4;
  return 5;
}

const SOLO_RANKS_DE = [
  'Meister-Architekt', 'Stadtplaner', 'Ingenieur',
  'Zimmermann', 'Baulehrling', 'Angehender Architekt'
];

/** Offizielle Solo-Rangtabelle (deutsche Namen — fürs Speicherformat der Bestenliste). */
export function soloRank(score: number): string {
  return SOLO_RANKS_DE[soloRankIndex(score)];
}

/** Deterministischer Seed für die Tages-Challenge: gleiches Datum = gleiche
 *  Karten und gleiches Deck, weltweit. */
export function dailySeed(dailyId: string): number {
  let h = 2166136261;
  for (const c of `tiny-towns-${dailyId}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
