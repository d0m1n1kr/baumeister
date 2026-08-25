// Lernmodus: Anzeige-Präferenz dieses Geräts (wie Alice-Modus und Ton) plus
// die Merkliste der weggetippten Erklärblasen. Der Spielzustand bleibt davon
// unberührt — die Engine weiß nichts vom Lernmodus.

import { LEARN_STEPS, pickStep, type LearnCtx, type LearnStepId } from './learnSteps';

const KEY = 'tinytowns.learn';
const SEEN_KEY = 'tinytowns.learn.seen';
const HINT_KEY = 'tinytowns.learn.hint';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'; // Standard: aus
  } catch {
    return false;
  }
}

function readHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) !== '0'; // Standard: zeigen
  } catch {
    return true;
  }
}

function readSeen(): LearnStepId[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const known: readonly string[] = LEARN_STEPS;
    return list.filter((x): x is LearnStepId => typeof x === 'string' && known.includes(x));
  } catch {
    return [];
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // privater Modus — die Wahl gilt dann nur für diese Sitzung
  }
}

let enabled = $state(readEnabled());
let seen = $state<LearnStepId[]>(readSeen());
let ctx = $state<LearnCtx | null>(null);
let hint = $state(readHint());

export const learn = {
  get enabled(): boolean {
    return enabled;
  },

  /** Die eigene Ecke meldet hier ihre Lage (auch ihren lokalen Bau-Flow),
   *  damit die Blase ohne Kenntnis der Komponenten entschieden werden kann. */
  get ctx(): LearnCtx | null {
    return ctx;
  },
  set ctx(next: LearnCtx | null) {
    ctx = next;
  },

  /** Die Blase zur aktuellen Lage (oder null: dann bleibt es still). */
  get step(): LearnStepId | null {
    return ctx ? pickStep(ctx, seen) : null;
  },

  /**
   * Ein-/Ausschalten. Einschalten heißt „erklär es mir": Die Merkliste der
   * weggetippten Blasen wird geleert — sonst bliebe ein neues Lernspiel stumm,
   * weil man die Blasen in einer FRÜHEREN Partie schon weggetippt hat.
   */
  set(on: boolean): void {
    enabled = on;
    store(KEY, on ? '1' : '0');
    if (on) this.resetSeen();
  },

  toggle(): boolean {
    this.set(!enabled);
    return enabled;
  },

  /** Hinweis auf den Lernmodus im Startbildschirm noch zeigen? */
  get showHint(): boolean {
    return hint;
  },

  /** Weggeklickt oder benutzt — beim nächsten Start nicht mehr zeigen. */
  dismissHint(): void {
    hint = false;
    store(HINT_KEY, '0');
  },

  /** Blase weggetippt — in dieser und in künftigen Partien nicht mehr zeigen. */
  dismiss(id: LearnStepId): void {
    if (seen.includes(id)) return;
    seen = [...seen, id];
    store(SEEN_KEY, JSON.stringify(seen));
  },

  /** Alle Erklärungen wieder von vorn (gilt nur für die laufende Partie). */
  resetSeen(): void {
    seen = [];
    store(SEEN_KEY, '[]');
  }
};
