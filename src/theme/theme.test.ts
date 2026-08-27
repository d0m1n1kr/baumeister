import { describe, it, expect } from 'vitest';
import { allCards, artBySvgName } from '../data';
import { pickTheme, SKINNED_THEMES, THEME_RESOURCES, THEME_STRINGS } from './index';

/**
 * Begriffe der klassischen Welt, die im jeweiligen Theme NICHT mehr
 * vorkommen dürfen — sonst mischt sich die Sprache (halb Hütte, halb Habitat).
 */
const FORBIDDEN: Record<string, { de: RegExp[]; en: RegExp[] }> = {
  mars: {
    de: [/Hütte/, /gefüttert/, /füttert/i, /\bStadt\b/, /Gebäude/, /Münze/, /Truhe/],
    en: [/cottage/i, /\bfed\b/i, /\btown\b/i, /building/i, /\bcoins?\b/i, /\bchest\b/i]
  },
  fantasy: {
    de: [/Hütte/, /gefüttert/, /füttert/i, /\bStadt\b/, /Gebäude/, /Münze/, /Truhe/],
    en: [/cottage/i, /\bfed\b/i, /\btown\b/i, /building/i, /\bcoins?\b/i, /\bchest\b/i]
  }
};

/** Karten, die ein Theme abdecken muss (Basisspiel, interne, Fortune, Landpartie). */
const themed = allCards.filter(
  (c) => c.set === 'base' || c.set === 'internal' || c.set === 'fortune' || c.set === 'landpartie'
);

describe.each(SKINNED_THEMES)('Theme "%s": Vollständigkeit', (id) => {
  it('deckt alle Karten ab (Name, Text, vorhandenes Artwork — de+en)', () => {
    expect(themed.length).toBe(70);
    for (const card of themed) {
      const th = card.themes?.[id];
      expect(th, `${card.id}: themes.${id} fehlt`).toBeTruthy();
      expect(th!.name.de, `${card.id}: name.de`).toBeTruthy();
      expect(th!.name.en, `${card.id}: name.en`).toBeTruthy();
      expect(th!.text.de, `${card.id}: text.de`).toBeTruthy();
      expect(th!.text.en, `${card.id}: text.en`).toBeTruthy();
      expect(th!.art, `${card.id}: art`).toBe(`${id}_${card.id}.svg`);
      expect(artBySvgName[th!.art!], `${card.id}: SVG-Datei fehlt`).toContain('<svg');
    }
  });

  it('Kartentexte benutzen die Begriffe des Themes, nicht die klassischen', () => {
    for (const card of themed) {
      const text = card.themes![id].text;
      for (const lang of ['de', 'en'] as const) {
        for (const re of FORBIDDEN[id][lang]) {
          expect(text[lang]!, `${card.id} (${lang}): "${re}" übrig`).not.toMatch(re);
        }
      }
    }
  });

  it('Ressourcen-Namen liefern de+en vollständig', () => {
    for (const lang of ['de', 'en']) {
      const names = THEME_RESOURCES[id]![lang];
      for (const r of ['wood', 'brick', 'stone', 'wheat', 'glass'] as const) {
        expect(names[r], `${lang}: ${r}`).toBeTruthy();
      }
    }
  });

  it('UI-Texte ersetzen die klassischen Spielbegriffe (Stadt, Gebäude, Bahn)', () => {
    for (const lang of ['de', 'en']) {
      const strings = THEME_STRINGS[id]![lang] as Record<string, unknown>;
      // Diese Schlüssel nennen die Welt beim Namen und müssen mitwechseln
      for (const key of [
        'chooseBuildTarget', 'declareComplete', 'townComplete', 'scoreFed',
        'trainMode', 'trainStopTitle', 'trainLoad', 'trainTunnel'
      ]) {
        expect(strings[key], `${id}/${lang}: ${key}`).toBeTruthy();
      }
      // Die Ortsangaben des Zuges sind Funktionen (Spielername einsetzen)
      for (const key of ['trainAt', 'trainPassing']) {
        expect(typeof strings[key], `${id}/${lang}: ${key}`).toBe('function');
        expect((strings[key] as (n: string) => string)('X')).toContain('X');
      }
    }
  });
});

describe('Theme-Wahl', () => {
  it('nur registrierte Themes, sonst klassisch', () => {
    expect(pickTheme('mars')).toBe('mars');
    expect(pickTheme('fantasy')).toBe('fantasy');
    expect(pickTheme('classic')).toBe('classic');
    expect(pickTheme('xyz')).toBe('classic');
    expect(pickTheme(null)).toBe('classic');
  });
});
