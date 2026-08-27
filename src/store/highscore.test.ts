import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addHighscore, highscores } from './highscore';

describe('Bestenliste', () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k)
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sortiert nach Punkten und meldet die Platzierung', () => {
    expect(addHighscore({ score: 20, rank: 'Zimmermann', date: '2026-08-23' })).toBe(1);
    expect(addHighscore({ score: 33, rank: 'Stadtplaner', date: '2026-08-23' })).toBe(1);
    expect(addHighscore({ score: 25, rank: 'Ingenieur', date: '2026-08-23' })).toBe(2);
    expect(highscores().map((e) => e.score)).toEqual([33, 25, 20]);
  });

  it('begrenzt auf 10 Einträge', () => {
    for (let i = 1; i <= 12; i++) addHighscore({ score: i, rank: 'x', date: '2026-08-23' });
    const list = highscores();
    expect(list).toHaveLength(10);
    expect(list[0].score).toBe(12);
    expect(list.at(-1)!.score).toBe(3); // die schwächsten zwei sind rausgefallen
  });
});

describe('Landpartie: getrennte Bestenliste', () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k)
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('filtert nach Modus, Bestandsdaten ohne mode zählen als Klassik', () => {
    addHighscore({ score: 20, rank: 'Alt', date: '2026-01-01' }); // Bestandseintrag
    addHighscore({ score: 55, rank: 'Land', date: '2026-08-27', mode: 'land' });
    addHighscore({ score: 30, rank: 'Neu', date: '2026-08-27' });
    expect(highscores().map((e) => e.score)).toEqual([30, 20]);
    expect(highscores('land').map((e) => e.score)).toEqual([55]);
  });

  it('die Platzierung zählt nur im eigenen Modus', () => {
    addHighscore({ score: 99, rank: 'K', date: '2026-01-01' });
    // 55 in der Landpartie ist dort Platz 1, obwohl die Klassik eine 99 hat
    expect(addHighscore({ score: 55, rank: 'L', date: '2026-08-27', mode: 'land' })).toBe(1);
  });
});
