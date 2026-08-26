// UI-Hilfskonstanten: Farben, Symbole, Rotationen.

import type { CardColor, FeatureId, Resource } from '../engine/types';

export const RESOURCE_CSS: Record<Resource, string> = {
  wood: 'var(--res-wood)',
  brick: 'var(--res-brick)',
  stone: 'var(--res-stone)',
  wheat: 'var(--res-wheat)',
  glass: 'var(--res-glass)'
};

export const CATEGORY_CSS: Record<CardColor, string> = {
  blue: 'var(--cat-blue)',
  red: 'var(--cat-red)',
  grey: 'var(--cat-grey)',
  orange: 'var(--cat-orange)',
  yellow: 'var(--cat-yellow)',
  green: 'var(--cat-green)',
  black: 'var(--cat-black)',
  pink: 'var(--cat-pink)'
};

/**
 * Zeichen der Effekt-Hinweise auf den Karten. Die Erklärung dazu steht in den
 * Sprachdateien (`t.features`) — vorher stand sie hier hart auf Deutsch und
 * sieben von acht Sprachen zeigten deutschen Text.
 */
export const FEATURE_ICONS: Record<FeatureId, string> = {
  feedable: '🍽',
  feeds: '🌾',
  adjacency: '↔',
  'no-adjacency': '⊘',
  'row-col': '✚',
  corners: '◰',
  center: '▣',
  'count-table': 'Σ',
  'holds-resource': '▦',
  'wild-resource': '★',
  interactive: '⚡',
  'on-construct': '✦',
  'placement-override': '⊞',
  'negative-vp': '−',
  'vs-neighbor': '⚔',
  'town-snapshot': '⌛',
  'finish-order': '🏁',
  'empty-ok': '◻',
  'unique-types': '❖',
  coins: '🪙'
};

/** Schlüssel der Erklärung in `t.features` zu einer Kartenfähigkeit. */
export const FEATURE_KEY: Record<FeatureId, string> = {
  feedable: 'feedable',
  feeds: 'feeds',
  adjacency: 'adjacency',
  'no-adjacency': 'noAdjacency',
  'row-col': 'rowCol',
  corners: 'corners',
  center: 'center',
  'count-table': 'countTable',
  'holds-resource': 'holdsResource',
  'wild-resource': 'wildResource',
  interactive: 'interactive',
  'on-construct': 'onConstruct',
  'placement-override': 'placementOverride',
  'negative-vp': 'negativeVp',
  'vs-neighbor': 'vsNeighbor',
  'town-snapshot': 'townSnapshot',
  'finish-order': 'finishOrder',
  'empty-ok': 'emptyOk',
  'unique-types': 'uniqueTypes',
  coins: 'coins'
};

/**
 * Klassen für die Beschriftung einer Materialmarke: `.resLabel` bricht um und
 * setzt die Schriftfarbe passend zum Material (siehe app.css); lange Namen —
 * Themen und andere Sprachen liefern sie reichlich — werden kleiner gesetzt,
 * damit sie in die runde Marke passen statt darüber hinauszuhängen.
 */
export function resLabel(text: string): string {
  if (text.length > 12) return 'resLabel xlong';
  if (text.length > 9) return 'resLabel long';
  return 'resLabel';
}

/** Rotation der Ecke, damit das UI zum Spieler zeigt (Ecken 2/3 sitzen oben). */
export function cornerRotation(corner: number): number {
  return corner === 2 || corner === 3 ? 180 : 0;
}

/** CSS-grid-area je Ecke: 0=unten links, 1=unten rechts, 2=oben rechts, 3=oben links. */
export function cornerArea(corner: number): string {
  return ['bl', 'br', 'tr', 'tl'][corner] ?? 'bl';
}
