import { describe, it, expect } from 'vitest';
import { allCards, catalog } from '../data';
import { mulberry32, randomSetup, CATEGORY_ORDER } from './registry';

describe('Karten-Assets', () => {
  it('Basisspiel: 25 Gebäude + 15 Monumente; Fortune: 12 + 10', () => {
    const count = (set: string, kind: 'building' | 'monument') =>
      allCards.filter((c) => c.set === set && (c.kind === 'monument') === (kind === 'monument')).length;
    expect(count('base', 'building')).toBe(25);
    expect(count('base', 'monument')).toBe(15);
    expect(count('fortune', 'building')).toBe(12);
    expect(count('fortune', 'monument')).toBe(10);
  });

  it('Basisspiel: je Kategorie 4 Karten (Cottage: 1); Fortune: je 2', () => {
    for (const cat of CATEGORY_ORDER) {
      const n = (set: string) =>
        allCards.filter((c) => c.set === set && c.kind !== 'monument' && c.category === cat).length;
      expect(n('base'), `base/${cat}`).toBe(cat === 'cottage' ? 1 : 4);
      expect(n('fortune'), `fortune/${cat}`).toBe(cat === 'cottage' ? 0 : 2);
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

  it('ordnet Spieler im Uhrzeigersinn (unten links → oben links → oben rechts → unten rechts)', () => {
    const cfg = randomSetup(catalog, players, false, mulberry32(1));
    expect(cfg.players.map((p) => p.corner)).toEqual([0, 3, 2, 1]);
    expect(cfg.players.map((p) => p.name)).toEqual(['A', 'D', 'C', 'B']);

    const two = randomSetup(
      catalog,
      [{ name: 'X', corner: 2 }, { name: 'Y', corner: 0 }],
      false,
      mulberry32(1)
    );
    expect(two.players.map((p) => p.name)).toEqual(['Y', 'X']);
  });

  it('ist mit gleichem Seed reproduzierbar', () => {
    const a = randomSetup(catalog, players, true, mulberry32(7));
    const b = randomSetup(catalog, players, true, mulberry32(7));
    expect(a).toEqual(b);
  });
});
