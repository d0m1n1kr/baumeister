// Spielstand-Persistenz im localStorage (versioniert).

import type { GameState } from '../engine/types';
import { SAVE_VERSION } from '../engine/game';

const KEY = 'tinytowns.save.v1';

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Speicher voll / privater Modus — Spiel läuft ohne Persistenz weiter
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    if (state?.v !== SAVE_VERSION || !Array.isArray(state.players)) return null;
    return state;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignorieren
  }
}
