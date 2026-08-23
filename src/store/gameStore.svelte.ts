// Bindeglied zwischen Engine und UI: reaktiver Zustand + Autosave.

import { catalog } from '../data';
import { apply, newGame, RuleError } from '../engine/game';
import type { Action, GameConfig, GameState } from '../engine/types';
import { saveGame, loadGame, clearSave } from './persist';

let state = $state<GameState | null>(null);

/**
 * Anbindung an den Mehrgerätemodus. Der Netzwerkcode registriert sich hier, damit
 * dieser Store nichts vom Netz wissen muss (keine zirkulären Importe).
 * Sind beide Felder null — der Ein-Gerät-Modus —, verhält sich alles wie zuvor.
 */
export const netBridge = {
  /** Gast: Aktion zum Host schicken statt selbst anzuwenden. */
  sendAction: null as ((action: Action) => void) | null,
  /** Host: nach jeder erfolgreich angewendeten Aktion den Zustand verteilen. */
  onLocalApplied: null as (() => void) | null
};

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
    // Gast: Der Host ist die Regelinstanz; Fehler kommen asynchron zurück.
    if (netBridge.sendAction) {
      netBridge.sendAction(action);
      return null;
    }
    if (!state) return 'Kein laufendes Spiel';
    try {
      state = apply(state, action, catalog);
      saveGame(state);
      netBridge.onLocalApplied?.();
      return null;
    } catch (e) {
      if (e instanceof RuleError) return e.message;
      throw e;
    }
  },

  /** Gast: vom Host empfangenen Zustand übernehmen (bewusst ohne Persistenz —
   *  ein gespiegelter Zustand darf nach einem Reload nicht als eigene Partie gelten). */
  setRemoteState(next: GameState): void {
    state = next;
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
