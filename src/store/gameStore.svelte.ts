// Bindeglied zwischen Engine und UI: reaktiver Zustand + Autosave.

import { catalog } from '../data';
import { apply, newGame, RuleError } from '../engine/game';
import type { Action, GameConfig, GameState } from '../engine/types';
import { saveGame, loadGame, clearSave } from './persist';

let state = $state<GameState | null>(null);

export const game = {
  get state(): GameState | null {
    return state;
  },

  start(config: GameConfig): void {
    state = newGame(config);
    saveGame(state);
  },

  /** Führt eine Aktion aus; gibt bei Regelverstoß die Fehlermeldung zurück. */
  dispatch(action: Action): string | null {
    if (!state) return 'Kein laufendes Spiel';
    try {
      state = apply(state, action, catalog);
      saveGame(state);
      return null;
    } catch (e) {
      if (e instanceof RuleError) return e.message;
      throw e;
    }
  },

  resume(): boolean {
    const saved = loadGame();
    if (!saved) return false;
    state = saved;
    return true;
  },

  hasSave(): boolean {
    return loadGame() !== null;
  },

  reset(): void {
    state = null;
    clearSave();
  }
};
