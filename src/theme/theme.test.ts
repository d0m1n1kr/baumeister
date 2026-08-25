import { describe, it, expect } from 'vitest';
import { allCards, artBySvgName } from '../data';
import { pickTheme, THEME_RESOURCES } from './index';

describe('Mars-Theme: Vollständigkeit', () => {
  const themed = allCards.filter((c) => c.set === 'base' || c.set === 'internal');

  it('deckt alle Basis- und internen Karten ab (Name, Text, Artwork de+en)', () => {
    expect(themed.length).toBe(42);
    for (const card of themed) {
      const mars = card.themes?.mars;
      expect(mars, `${card.id}: themes.mars fehlt`).toBeTruthy();
      expect(mars!.name.de, `${card.id}: name.de`).toBeTruthy();
      expect(mars!.name.en, `${card.id}: name.en`).toBeTruthy();
      expect(mars!.text.de, `${card.id}: text.de`).toBeTruthy();
      expect(mars!.text.en, `${card.id}: text.en`).toBeTruthy();
      expect(mars!.art, `${card.id}: art`).toBe(`mars_${card.id}.svg`);
      expect(artBySvgName[mars!.art!], `${card.id}: SVG-Datei fehlt`).toContain('<svg');
    }
  });

  it('Mars-Texte verwenden die Kolonie-Begriffe statt der klassischen', () => {
    for (const card of themed) {
      const text = card.themes!.mars.text;
      for (const [lang, forbidden] of [
        ['de', [/Hütte/, /gefüttert/, /füttert/i, /\bStadt\b/, /Gebäude/]],
        ['en', [/cottage/i, /\bfed\b/i, /\btown\b/i, /building/i]]
      ] as const) {
        for (const re of forbidden) {
          expect(text[lang]!, `${card.id} (${lang}): "${re}" übrig`).not.toMatch(re);
        }
      }
    }
  });

  it('Ressourcen-Namen: Mars liefert de+en vollständig', () => {
    for (const lang of ['de', 'en']) {
      const names = THEME_RESOURCES.mars![lang];
      for (const r of ['wood', 'brick', 'stone', 'wheat', 'glass'] as const) {
        expect(names[r], `${lang}: ${r}`).toBeTruthy();
      }
    }
  });

  it('pickTheme: nur gültige Werte, sonst klassisch', () => {
    expect(pickTheme('mars')).toBe('mars');
    expect(pickTheme('classic')).toBe('classic');
    expect(pickTheme('xyz')).toBe('classic');
    expect(pickTheme(null)).toBe('classic');
  });
});
