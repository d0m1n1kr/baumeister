import { describe, it, expect } from 'vitest';
import { allCards, catalog } from '../data';
import { mulberry32, randomSetup, CATEGORY_ORDER } from './registry';

describe('Karten-Assets', () => {
  it('vollständiges Basisspiel: 25 Gebäude + 15 Monumente', () => {
    const buildings = allCards.filter((c) => c.kind !== 'monument');
    const monuments = allCards.filter((c) => c.kind === 'monument');
    expect(buildings.length).toBe(25);
    expect(monuments.length).toBe(15);
  });

  it('je Kategorie 4 Karten (Cottage: 1)', () => {
    for (const cat of CATEGORY_ORDER) {
      const n = allCards.filter((c) => c.kind !== 'monument' && c.category === cat).length;
      expect(n, `Kategorie ${cat}`).toBe(cat === 'cottage' ? 1 : 4);
    }
  });

  it('alle Karten haben deutsche Texte und gültige Muster', () => {
    for (const c of allCards) {
      expect(c.name.de, c.id).toBeTruthy();
      expect(c.text.de, c.id).toBeTruthy();
      expect(c.pattern.flat().some((cell) => cell !== null), c.id).toBe(true);
    }
  });
});

describe('randomSetup', () => {
  const players = [
    { name: 'A', corner: 0 },
    { name: 'B', corner: 1 },
    { name: 'C', corner: 2 },
    { name: 'D', corner: 3 }
  ];

  it('wählt 7 Karten (1 je Kategorie) und teilt 2 Monumente pro Spieler aus', () => {
    const cfg = randomSetup(catalog, players, true, mulberry32(42));
    expect(cfg.activeCards.length).toBe(7);
    expect(cfg.activeCards[0]).toBe('cottage');
    const cats = cfg.activeCards.map((id) => catalog[id].category);
    expect(new Set(cats).size).toBe(7);

    expect(cfg.monumentDeals.length).toBe(4);
    const dealt = cfg.monumentDeals.flat();
    expect(dealt.length).toBe(8);
    expect(new Set(dealt).size).toBe(8); // keine Duplikate
    for (const id of dealt) expect(catalog[id].kind).toBe('monument');
    expect(cfg.firstMasterBuilder).toBeGreaterThanOrEqual(0);
    expect(cfg.firstMasterBuilder).toBeLessThan(4);
  });

  it('ist mit gleichem Seed reproduzierbar', () => {
    const a = randomSetup(catalog, players, true, mulberry32(7));
    const b = randomSetup(catalog, players, true, mulberry32(7));
    expect(a).toEqual(b);
  });
});
