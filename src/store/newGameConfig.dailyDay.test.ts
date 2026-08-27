import { describe, expect, it } from 'vitest';
import { DAILY_HISTORY, dayId, dayPlayable, shiftDay, todayId } from './newGameConfig';

describe('Tage der Challenge', () => {
  it('verschiebt Tage', () => {
    expect(shiftDay('2026-08-26', -1)).toBe('2026-08-25');
    expect(shiftDay('2026-08-26', 1)).toBe('2026-08-27');
  });

  it('rollt über Monats- und Jahresgrenzen', () => {
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDay('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('kennt den Schalttag', () => {
    expect(shiftDay('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDay('2023-02-28', 1)).toBe('2023-03-01');
  });

  it('bleibt über eine Zeitumstellung hinweg auf dem richtigen Tag', () => {
    // Mit +86400000 ms landet man in der Nacht der Umstellung im Vortag.
    expect(shiftDay('2026-03-29', -1)).toBe('2026-03-28');
    expect(shiftDay('2026-03-28', 1)).toBe('2026-03-29');
    expect(shiftDay('2026-10-25', -1)).toBe('2026-10-24');
  });

  it('lässt heute und die letzten Tage zu, die Zukunft nicht', () => {
    const heute = '2026-08-26';
    expect(dayPlayable(heute, heute)).toBe(true);
    expect(dayPlayable(shiftDay(heute, -1), heute)).toBe(true);
    expect(dayPlayable(shiftDay(heute, -DAILY_HISTORY), heute)).toBe(true);
    expect(dayPlayable(shiftDay(heute, -DAILY_HISTORY - 1), heute)).toBe(false);
    expect(dayPlayable(shiftDay(heute, 1), heute)).toBe(false);
  });

  it('todayId ist der heutige Tag in dieser Zeitzone', () => {
    expect(todayId()).toBe(dayId(new Date()));
    expect(todayId()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
