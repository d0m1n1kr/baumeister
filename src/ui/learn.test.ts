import { describe, it, expect } from 'vitest';
import { LEARN_STEPS, pickStep, type LearnCtx } from './learnSteps';
import { LANGUAGES, TRANSLATIONS } from '../i18n';

const BASE: LearnCtx = {
  phase: 'round',
  monumentPending: false,
  seedPending: false,
  offer: false,
  pending: false,
  swap: false,
  trainHere: false,
  canBuild: false,
  mode: 'idle',
  boardFull: false,
  roundDone: false,
  canFinish: false
};

const ctx = (over: Partial<LearnCtx> = {}): LearnCtx => ({ ...BASE, ...over });
/** Alle Schritte außer den genannten gelten als bereits weggetippt. */
const seenExcept = (...keep: string[]) => LEARN_STEPS.filter((id) => !keep.includes(id));

describe('Lernmodus: Auswahl der Erklärblase', () => {
  it('beginnt mit der Einführung und macht sie nach dem Wegtippen frei', () => {
    expect(pickStep(ctx({ phase: 'monumentDraft', monumentPending: true }), [])).toBe('welcome');
    expect(pickStep(ctx({ phase: 'monumentDraft', monumentPending: true }), ['welcome']))
      .toBe('monument');
  });

  it('zeigt je Lage genau die passende Blase', () => {
    const cases: [Partial<LearnCtx>, string][] = [
      [{ phase: 'seedPlacement', seedPending: true }, 'seed'],
      [{ offer: true }, 'offer'],
      [{ pending: true }, 'place'],
      [{ pending: true, swap: true }, 'swap'],
      [{ pending: true, trainHere: true }, 'train'],
      [{ mode: 'select' }, 'select'],
      [{ mode: 'target' }, 'target'],
      [{ canBuild: true }, 'build'],
      [{ boardFull: true }, 'complete'],
      [{ canFinish: true }, 'done']
    ];
    for (const [over, expected] of cases) {
      expect(pickStep(ctx(over), ['welcome']), JSON.stringify(over)).toBe(expected);
    }
  });

  it('platzieren geht vor bauen, der Bau-Modus vor allem anderen', () => {
    expect(pickStep(ctx({ pending: true, canBuild: true }), ['welcome'])).toBe('place');
    expect(pickStep(ctx({ pending: true, canBuild: true }), ['welcome', 'place'])).toBe('build');
    expect(pickStep(ctx({ pending: true, mode: 'select' }), ['welcome'])).toBe('select');
  });

  it('bleibt still, wenn nichts ansteht oder alles weggetippt ist', () => {
    expect(pickStep(ctx({ roundDone: true }), ['welcome'])).toBeNull();
    expect(pickStep(ctx({ pending: true, canBuild: true }), [...LEARN_STEPS])).toBeNull();
  });

  it('zeigt „Fertig" und „Abschließen" nur außerhalb des Bau-Modus', () => {
    expect(pickStep(ctx({ canFinish: true, mode: 'target' }), seenExcept('done'))).toBeNull();
    expect(pickStep(ctx({ boardFull: true, mode: 'select' }), seenExcept('complete'))).toBeNull();
  });
});

describe('Lernmodus: Texte', () => {
  it('jede Sprache liefert alle Schritte mit Titel, Text und Mehrspieler-Hinweis', () => {
    for (const { code } of LANGUAGES) {
      const learn = TRANSLATIONS[code].learn;
      for (const id of LEARN_STEPS) {
        const step = learn.steps[id];
        expect(step, `${code}: ${id}`).toBeTruthy();
        expect(step.title.length, `${code}: ${id}.title`).toBeGreaterThan(2);
        expect(step.body.length, `${code}: ${id}.body`).toBeGreaterThan(20);
        expect(step.mp.length, `${code}: ${id}.mp`).toBeGreaterThan(10);
      }
      expect(learn.multiSteps.length, `${code}: multiSteps`).toBe(7);
      for (const line of learn.multiSteps) expect(line.length).toBeGreaterThan(20);
      expect(learn.suggestCompletes('X')).toContain('X');
      expect(learn.suggestTowards('X', 2, 3)).toContain('X');
      expect(learn.suggestBuild('X')).toContain('X');
    }
  });

  it('bleiben themeneutral: keine Hütten, Städte, Münzen oder Bahnhöfe', () => {
    // Sonst müsste jedes Theme (Mars, Drachenreich) eigene Lerntexte liefern.
    const FORBIDDEN: Record<string, RegExp[]> = {
      de: [/Hütte/i, /\bStadt\b/i, /Gebäude/i, /Münze/i, /Truhe/i, /Bahnhof/i, /Waggon/i],
      // „Town Hall mode" ist der Name der offiziellen Variante und wechselt
      // mit dem Theme nicht mit — daher ausgenommen.
      en: [/cottage/i, /\btown\b(?!\s*hall)/i, /building/i, /\bcoins?\b/i, /\bchest\b/i, /\bstation\b/i, /\bwagon/i]
    };
    for (const [code, patterns] of Object.entries(FORBIDDEN)) {
      const learn = TRANSLATIONS[code].learn;
      const texts = [
        ...learn.multiSteps,
        ...LEARN_STEPS.flatMap((id) => {
          const s = learn.steps[id];
          return [s.title, s.body, s.mp];
        })
      ];
      for (const text of texts) {
        for (const re of patterns) {
          expect(text, `${code}: "${re}" in "${text}"`).not.toMatch(re);
        }
      }
    }
  });
});
