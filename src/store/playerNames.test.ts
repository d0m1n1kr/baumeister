import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PLAYERS, NAME_MAX, loadNames, sanitize, saveNames } from './playerNames';

describe('sanitize', () => {
  it('liefert immer genau vier Plätze', () => {
    expect(sanitize(['A']).length).toBe(MAX_PLAYERS);
    expect(sanitize(['A', 'B', 'C', 'D', 'E']).length).toBe(MAX_PLAYERS);
  });

  it('behält die Reihenfolge und lässt Lücken leer', () => {
    expect(sanitize(['Anna', '', 'Cem'])).toEqual(['Anna', '', 'Cem', '']);
  });

  it('schneidet Leerzeichen weg', () => {
    expect(sanitize(['  Anna  '])[0]).toBe('Anna');
  });

  it('kürzt auf die Feldlänge', () => {
    expect(sanitize(['x'.repeat(40)])[0]).toHaveLength(NAME_MAX);
  });

  it('verwirft, was kein Text ist — auch aus alten oder fremden Daten', () => {
    expect(sanitize([1, null, { a: 1 }, 'Dana'])).toEqual(['', '', '', 'Dana']);
    expect(sanitize('Anna')).toEqual(['', '', '', '']);
    expect(sanitize(null)).toEqual(['', '', '', '']);
  });
});

describe('laden und merken', () => {
  let speicher: Record<string, string>;

  beforeEach(() => {
    speicher = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => speicher[k] ?? null,
      setItem: (k: string, v: string) => {
        speicher[k] = v;
      },
      removeItem: (k: string) => {
        delete speicher[k];
      }
    });
  });

  it('gibt zurück, was gemerkt wurde', () => {
    saveNames(['Anna', 'Bert', '', '']);
    expect(loadNames()).toEqual(['Anna', 'Bert', '', '']);
  });

  it('vergisst den Eintrag, wenn alle Namen gelöscht sind', () => {
    saveNames(['Anna']);
    expect(Object.keys(speicher)).toHaveLength(1);
    saveNames(['', '', '', '']);
    expect(Object.keys(speicher)).toHaveLength(0);
    expect(loadNames()).toEqual(['', '', '', '']);
  });

  it('übersteht kaputten Inhalt', () => {
    speicher['tinytowns.names.v1'] = '{nicht json';
    expect(loadNames()).toEqual(['', '', '', '']);
  });

  it('übersteht einen Speicher, der wirft (privater Modus)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('nope');
      },
      setItem: () => {
        throw new Error('nope');
      },
      removeItem: () => {
        throw new Error('nope');
      }
    });
    expect(loadNames()).toEqual(['', '', '', '']);
    expect(() => saveNames(['Anna'])).not.toThrow();
  });
});
