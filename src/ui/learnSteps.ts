// Lernmodus: welche Erklärblase gehört zur aktuellen Lage? Reine Logik ohne
// DOM und ohne Reaktivität — damit die Auswahl der Schritte testbar bleibt.

/** Schritte in der Reihenfolge ihrer Priorität (erster Treffer gewinnt). */
export const LEARN_STEPS = [
  'welcome',   // Ziel des Spiels
  'monument',  // Monument-Draft
  'seed',      // Tiny Trees: Samen setzen
  'select',    // Bau-Modus: Felder markieren
  'target',    // Bau-Modus: Bauplatz wählen
  'train',     // Eisenbahn: der Zug hält
  'swap',      // Fabrik-/Münztausch möglich
  'offer',     // Solo: Material aus dem Deck wählen
  'place',     // Material platzieren
  'build',     // ein Muster ist vollständig
  'complete',  // Stadt fertigstellen
  'done'       // Runde beenden
] as const;

export type LearnStepId = (typeof LEARN_STEPS)[number];

/** Bau-Flow der eigenen Ecke, von PlayerCorner gespiegelt. */
export type LearnMode = 'idle' | 'select' | 'target' | 'other';

export interface LearnCtx {
  phase: 'monumentDraft' | 'seedPlacement' | 'nameResource' | 'round' | 'gameOver';
  /** Monument-Draft läuft und ist noch offen. */
  monumentPending: boolean;
  seedPending: boolean;
  /** Solo: die 3 Materialkarten liegen zur Wahl aus. */
  offer: boolean;
  /** Material in der Hand. */
  pending: boolean;
  /** Fabrik- oder Münztausch steht zur Verfügung. */
  swap: boolean;
  trainHere: boolean;
  /** Ein vollständiges Muster liegt auf dem Brett. */
  canBuild: boolean;
  mode: LearnMode;
  boardFull: boolean;
  roundDone: boolean;
  /** „Fertig" ist jetzt der nächste Schritt. */
  canFinish: boolean;
}

const WHEN: Record<LearnStepId, (c: LearnCtx) => boolean> = {
  welcome: () => true,
  monument: (c) => c.phase === 'monumentDraft' && c.monumentPending,
  seed: (c) => c.phase === 'seedPlacement' && c.seedPending,
  select: (c) => c.mode === 'select',
  target: (c) => c.mode === 'target',
  train: (c) => c.trainHere,
  swap: (c) => c.pending && c.swap,
  offer: (c) => c.offer,
  place: (c) => c.pending,
  build: (c) => c.canBuild && c.mode === 'idle' && !c.roundDone,
  complete: (c) => c.boardFull && c.mode === 'idle' && !c.roundDone,
  done: (c) => c.canFinish && c.mode === 'idle'
};

/**
 * Der erste Schritt, der zur Lage passt und noch nicht weggetippt wurde.
 * Ohne Treffer bleibt es still — eine Blase pro Moment, nie mehr.
 */
export function pickStep(ctx: LearnCtx, seen: readonly string[]): LearnStepId | null {
  for (const id of LEARN_STEPS) {
    if (seen.includes(id)) continue;
    if (WHEN[id](ctx)) return id;
  }
  return null;
}
