// Kartenkatalog: Validierung der JSON-Assets + zufälliges Partie-Setup.

import type { CardDef, Catalog, Category, GameConfig } from './types';

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

function shuffled<T>(arr: T[], rng: Rng): T[] {
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

export function randomSetup(
  catalog: Catalog,
  playersInput: { name: string; corner: number }[],
  useMonuments: boolean,
  rng: Rng,
  sets: string[] = ['base'],
  systems: { coins?: boolean; trees?: boolean } = {}
): GameConfig {
  // Spielerreihenfolge = Sitzreihenfolge im Uhrzeigersinn, damit der
  // Baumeister im Uhrzeigersinn weiterwandert.
  const players = [...playersInput].sort(
    (a, b) => CLOCKWISE_CORNERS.indexOf(a.corner) - CLOCKWISE_CORNERS.indexOf(b.corner)
  );
  if (!sets.includes('base')) sets = ['base', ...sets];
  // Erweiterungskarten werden laut Anleitung einfach in die Stapel gemischt.
  const defs = Object.values(catalog).filter((d) => sets.includes(d.set));
  const activeCards: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const pool = defs.filter((d) => d.kind !== 'monument' && d.category === cat);
    if (pool.length === 0) throw new AssetError(`Keine Karten in Kategorie "${cat}"`);
    activeCards.push(pool[Math.floor(rng() * pool.length)].id);
  }

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
    sets,
    systems: { coins: systems.coins ?? false, trees: systems.trees ?? false }
  };
}
