import { describe, expect, it } from 'vitest';
import { buildingLines, wrapLines } from './scoreCard';

/** Ersatz für ctx.measureText: jedes Zeichen ist 10 breit. */
const measure = (s: string) => s.length * 10;

describe('wrapLines', () => {
  it('lässt kurzen Text in einer Zeile', () => {
    expect(wrapLines('kurz', 100, measure)).toEqual(['kurz']);
  });

  it('bricht an Wortgrenzen um', () => {
    expect(wrapLines('eins zwei drei', 100, measure)).toEqual(['eins zwei', 'drei']);
  });

  it('lässt ein zu langes Wort stehen, statt es zu verschlucken', () => {
    expect(wrapLines('Donaudampfschiff', 50, measure)).toEqual(['Donaudampfschiff']);
  });

  it('gibt für leeren Text nichts zurück', () => {
    expect(wrapLines('', 100, measure)).toEqual([]);
    expect(wrapLines('   ', 100, measure)).toEqual([]);
  });
});

describe('buildingLines', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `Gebaeude${i}`, count: i + 1 }));

  it('setzt wenige Gebäude in eine Zeile', () => {
    const lines = buildingLines([{ name: 'Huette', count: 5 }], 400, measure);
    expect(lines).toEqual(['Huette ×5']);
  });

  it('hält die Zeilengrenze ein und kürzt den Rest', () => {
    const lines = buildingLines(many, 400, measure, 3, (n) => `+ ${n}`);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.join(' ')).toContain('+');
  });

  it('nennt im Rest-Hinweis die Zahl der weggelassenen Gebäude', () => {
    const lines = buildingLines(many, 400, measure, 3, (n) => `+ ${n}`);
    const shown = lines.join('  ').match(/Gebaeude\d+/g)?.length ?? 0;
    const rest = Number(/\+ (\d+)/.exec(lines.join(' '))?.[1] ?? 0);
    expect(shown + rest).toBe(many.length);
  });

  it('gibt ohne Gebäude nichts zurück', () => {
    expect(buildingLines([], 400, measure)).toEqual([]);
  });

  it('gibt nichts zurück, wenn nicht einmal ein Eintrag passt', () => {
    expect(buildingLines([{ name: 'x'.repeat(100), count: 1 }], 40, measure, 1)).toEqual([]);
  });
});
