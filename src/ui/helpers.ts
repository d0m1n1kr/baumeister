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

export const FEATURE_ICONS: Record<FeatureId, { icon: string; title: string }> = {
  feedable: { icon: '🍽', title: 'Muss gefüttert werden' },
  feeds: { icon: '🌾', title: 'Füttert Hütten' },
  adjacency: { icon: '↔', title: 'Nachbarschaft zählt' },
  'no-adjacency': { icon: '⊘', title: 'Bestimmte Nachbarn vermeiden' },
  'row-col': { icon: '✚', title: 'Zeile & Spalte zählen' },
  corners: { icon: '◰', title: 'Ecken zählen' },
  center: { icon: '▣', title: 'Zentrum zählt' },
  'count-table': { icon: 'Σ', title: 'Punkte nach Anzahl' },
  'holds-resource': { icon: '▦', title: 'Lagert Material' },
  'wild-resource': { icon: '★', title: 'Joker-Material' },
  interactive: { icon: '⚡', title: 'Laufender Effekt' },
  'on-construct': { icon: '✦', title: 'Effekt beim Bau' },
  'placement-override': { icon: '⊞', title: 'Freie Platzwahl' },
  'negative-vp': { icon: '−', title: 'Minuspunkte möglich' },
  'vs-neighbor': { icon: '⚔', title: 'Vergleich mit Nachbar' },
  'town-snapshot': { icon: '⌛', title: 'Zeitpunkt des Baus zählt' },
  'finish-order': { icon: '🏁', title: 'Fertigstellungs-Reihenfolge' },
  'empty-ok': { icon: '◻', title: 'Leere Felder erlaubt' },
  'unique-types': { icon: '❖', title: 'Verschiedene Typen zählen' },
  coins: { icon: '🪙', title: 'Münz-Effekt' }
};

/** Rotation der Ecke, damit das UI zum Spieler zeigt (Ecken 2/3 sitzen oben). */
export function cornerRotation(corner: number): number {
  return corner === 2 || corner === 3 ? 180 : 0;
}

/** CSS-grid-area je Ecke: 0=unten links, 1=unten rechts, 2=oben rechts, 3=oben links. */
export function cornerArea(corner: number): string {
  return ['bl', 'br', 'tr', 'tl'][corner] ?? 'bl';
}
