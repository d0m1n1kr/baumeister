import { describe, expect, it } from 'vitest';
import { reserveFor } from './panelReserve.svelte';

describe('reserveFor', () => {
  it('reserviert nichts, wo es kein Panel gibt', () => {
    expect(reserveFor([])).toBe(0);
  });

  it('hält auch das einzelne Panel (Solo an einem Gerät) auf seiner Marke', () => {
    // Solo: nichts abzustimmen, aber der Inhalt wechselt mit der Phase —
    // Materialwähler 99, Runde 56, nach dem Legen 116. Ohne Marke rutschte
    // das Brett bei jeder Ansage auf und ab.
    const ansage = reserveFor([{ content: 99, row: 700 }]);
    const runde = reserveFor([{ content: 56, row: 700 }], ansage);
    const danach = reserveFor([{ content: 116, row: 700 }], runde);
    expect({ ansage, runde, danach }).toEqual({ ansage: 104, runde: 104, danach: 120 });
  });

  it('gibt allen die Höhe, die das inhaltsreichste Panel braucht', () => {
    // Ansage-Phase: nur der Baumeister trägt den Materialwähler (75 → Stufe 80)
    expect(
      reserveFor([
        { content: 0, row: 366 },
        { content: 75, row: 366 },
        { content: 0, row: 366 },
        { content: 0, row: 366 }
      ])
    ).toBe(80);
  });

  it('hält die Höchstmarke, wenn der Inhalt wieder kleiner wird', () => {
    // Genau das macht das Brett ruhig: Die Runde braucht weniger als die
    // Ansage, aber das Brett soll deswegen nicht wieder wachsen.
    const ansage = reserveFor([{ content: 75, row: 366 }, { content: 0, row: 366 }]);
    const runde = reserveFor([{ content: 56, row: 366 }, { content: 56, row: 366 }], ansage);
    expect({ ansage, runde }).toEqual({ ansage: 80, runde: 80 });
  });

  it('wächst weiter, wenn ein Panel mehr braucht als je zuvor', () => {
    expect(reserveFor([{ content: 108, row: 546 }, { content: 0, row: 546 }], 80)).toBe(112);
  });

  it('vergisst die Marke, wo der Rahmen neu ist (fresh)', () => {
    expect(reserveFor([{ content: 0, row: 366 }, { content: 0, row: 366 }], 0)).toBe(0);
  });

  it('bleibt stehen, wenn ein Text nur ein paar Pixel höher umbricht', () => {
    // Ohne Raster wanderte das Brett bei jeder Kleinigkeit
    const a = reserveFor([{ content: 54, row: 366 }, { content: 0, row: 366 }]);
    const b = reserveFor([{ content: 56, row: 366 }, { content: 0, row: 366 }], a);
    expect(b).toBe(a);
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

  it('rundet auf die Stufe auf, nie ab', () => {
    expect(reserveFor([{ content: 74.2, row: 900 }, { content: 0, row: 900 }])).toBe(80);
    expect(reserveFor([{ content: 80, row: 900 }, { content: 0, row: 900 }])).toBe(80);
  });

  it('kommt ohne gemessene Zeilenhöhe aus (noch nicht gelayoutet)', () => {
    expect(reserveFor([{ content: 75, row: 0 }, { content: 0, row: 0 }])).toBe(80);
  });
});
