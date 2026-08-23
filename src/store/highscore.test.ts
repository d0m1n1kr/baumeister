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
