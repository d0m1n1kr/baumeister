// Lädt alle Karten-Assets. Neue Karten = neue JSON-Datei (+ SVG) — kein Code nötig.

import type { CardDef, Catalog } from '../engine/types';
import { buildCatalog } from '../engine/registry';
import { theme } from '../theme';

const buildingModules = import.meta.glob('./buildings/*.json', { eager: true });
const monumentModules = import.meta.glob('./monuments/*.json', { eager: true });
const artModules = import.meta.glob('./art/*.svg', { eager: true, query: '?raw', import: 'default' });

function defs(modules: Record<string, unknown>): CardDef[] {
  return Object.values(modules).map((m) => ((m as { default?: CardDef }).default ?? m) as CardDef);
}

export const allCards: CardDef[] = [...defs(buildingModules), ...defs(monumentModules)];

export const catalog: Catalog = buildCatalog(allCards);

/** SVG-Quelltext je Dateiname (z. B. "farm.svg"). */
export const artBySvgName: Record<string, string> = Object.fromEntries(
  Object.entries(artModules).map(([path, svg]) => [path.split('/').pop()!, svg as string])
);

export function artFor(card: CardDef): string | undefined {
  const themedArt = theme !== 'classic' ? card.themes?.[theme]?.art : undefined;
  if (themedArt && artBySvgName[themedArt]) return artBySvgName[themedArt];
  return card.art ? artBySvgName[card.art] : undefined;
}

/** Landschafts-Kachel (Landpartie) — gleiche Namenskonvention wie Karten:
 *  `<theme>_<kind>.svg` mit klassischem `<kind>.svg` als Rückfall. */
export function artForTerrain(kind: string): string | undefined {
  return artBySvgName[`${theme}_${kind}.svg`] ?? artBySvgName[`${kind}.svg`];
}
