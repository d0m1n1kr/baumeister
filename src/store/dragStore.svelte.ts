// Globaler Drag-Zustand. Pro Spieler ein Eintrag, damit mehrere Spieler
// GLEICHZEITIG ziehen können (Multi-Touch). Die Geist-Chips werden unrotiert
// auf Tisch-Ebene gerendert, weil position:fixed innerhalb rotierter Ecken
// nicht zuverlässig funktioniert.

import type { Resource } from '../engine/types';

export interface DragInfo {
  resource: Resource;
  x: number;
  y: number;
  pointerId: number;
}

export const drags = $state<Record<number, DragInfo | undefined>>({});
