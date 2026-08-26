import { describe, expect, it } from 'vitest';
import { reserveFor } from './panelReserve.svelte';

describe('reserveFor', () => {
  it('stimmt nichts ab, wo es nur ein Panel gibt (Einzelansicht, Solo)', () => {
    expect(reserveFor([])).toBe(0);
    expect(reserveFor([{ content: 75, row: 366 }])).toBe(0);
  });

  it('gibt allen die Höhe, die das inhaltsreichste Panel braucht', () => {
    // Ansage-Phase: nur der Baumeister trägt den Materialwähler
    expect(
      reserveFor([
        { content: 0, row: 366 },
        { content: 75, row: 366 },
        { content: 0, row: 366 },
        { content: 0, row: 366 }
      ])
    ).toBe(75);
  });

  it('reserviert nichts, solange kein Panel etwas zeigt', () => {
    expect(reserveFor([{ content: 0, row: 366 }, { content: 0, row: 366 }])).toBe(0);
  });

  it('nimmt dem Brett nie mehr als die Hälfte der Zeile', () => {
    // Ein überlanges Panel (fremde Sprache, Lerntipp) darf das Brett nicht
    // auf einen Streifen zusammendrücken — der Rest bleibt scrollbar.
    expect(reserveFor([{ content: 500, row: 366 }, { content: 0, row: 366 }])).toBe(183);
  });

  it('richtet sich beim Deckel nach der kleinsten Zeile', () => {
    expect(reserveFor([{ content: 300, row: 800 }, { content: 0, row: 200 }])).toBe(100);
  });

  it('rundet auf, damit kein Brett einen halben Pixel größer ist', () => {
    expect(reserveFor([{ content: 74.2, row: 900 }, { content: 0, row: 900 }])).toBe(75);
  });

  it('kommt ohne gemessene Zeilenhöhe aus (noch nicht gelayoutet)', () => {
    expect(reserveFor([{ content: 75, row: 0 }, { content: 0, row: 0 }])).toBe(75);
  });
});
