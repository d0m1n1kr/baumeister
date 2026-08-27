import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS, loadPrefs, sanitize, savePrefs } from './setupPrefs';

describe('sanitize', () => {
  it('nimmt gültige Einstellungen unverändert', () => {
    const prefs = {
      count: 2,
      multiDevice: true,
      soloMode: 'daily' as const,
      land: true,
      useMonuments: false,
      sets: ['fortune'],
      townHall: true,
      train: true,
      cavern: true
    };
    expect(sanitize(prefs)).toEqual(prefs);
  });

  it('fällt bei fehlenden Angaben auf den Standard zurück', () => {
    expect(sanitize({})).toEqual(DEFAULTS);
    expect(sanitize(null)).toEqual(DEFAULTS);
    expect(sanitize('kaputt')).toEqual(DEFAULTS);
  });

  it('hält die Spielerzahl im gültigen Bereich', () => {
    expect(sanitize({ count: 0 }).count).toBe(DEFAULTS.count);
    expect(sanitize({ count: 5 }).count).toBe(DEFAULTS.count);
    expect(sanitize({ count: 2.5 }).count).toBe(DEFAULTS.count);
    expect(sanitize({ count: '3' }).count).toBe(DEFAULTS.count);
    expect(sanitize({ count: 1 }).count).toBe(1);
  });

  it('kennt nur die drei Solo-Varianten', () => {
    expect(sanitize({ soloMode: 'learn' }).soloMode).toBe('learn');
    expect(sanitize({ soloMode: 'turnier' }).soloMode).toBe('free');
  });

  it('verwirft Erweiterungen, die es nicht gibt — und Dubletten', () => {
    // Genau der Fall „alter Eintrag, Erweiterung inzwischen umbenannt"
    expect(sanitize({ sets: ['fortune', 'gibtsnicht', 'fortune'] }).sets).toEqual(['fortune']);
    expect(sanitize({ sets: 'fortune' }).sets).toEqual([]);
    expect(sanitize({ sets: [1, null] }).sets).toEqual([]);
  });

  it('nimmt „base" nicht in die Liste — es ist immer dabei', () => {
    expect(sanitize({ sets: ['base', 'fortune'] }).sets).toEqual(['fortune']);
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
    savePrefs({ ...DEFAULTS, count: 2, sets: ['fortune'] });
    expect(loadPrefs()).toEqual({ ...DEFAULTS, count: 2, sets: ['fortune'] });
  });

  it('vergisst den Eintrag, wenn alles wieder Standard ist', () => {
    savePrefs({ ...DEFAULTS, count: 1 });
    expect(Object.keys(speicher)).toHaveLength(1);
    savePrefs(DEFAULTS);
    expect(Object.keys(speicher)).toHaveLength(0);
    expect(loadPrefs()).toEqual(DEFAULTS);
  });

  it('übersteht kaputten Inhalt', () => {
    speicher['tinytowns.setup.v1'] = '{nicht json';
    expect(loadPrefs()).toEqual(DEFAULTS);
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
    expect(loadPrefs()).toEqual(DEFAULTS);
    expect(() => savePrefs({ ...DEFAULTS, count: 2 })).not.toThrow();
  });
});
