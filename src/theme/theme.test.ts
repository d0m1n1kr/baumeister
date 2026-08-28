import { describe, it, expect } from 'vitest';
import { allCards, artBySvgName } from '../data';
import { pickTheme, SKINNED_THEMES, THEME_RESOURCES, THEME_STRINGS } from './index';

/**
 * Begriffe der klassischen Welt, die im jeweiligen Theme NICHT mehr
 * vorkommen dürfen — sonst mischt sich die Sprache (halb Hütte, halb Habitat).
 */
const FORBIDDEN: Record<string, { de: RegExp[]; en: RegExp[] }> = {
  mars: {
    de: [/hütte/i, /gefüttert/i, /füttert/i, /\bStadt\b/, /gebäude/i, /münze/i, /truhe/i],
    en: [/cottage/i, /\bfed\b/i, /\btown\b/i, /building/i, /\bcoins?\b/i, /\bchest\b/i]
  },
  fantasy: {
    de: [/hütte/i, /gefüttert/i, /füttert/i, /\bStadt\b/, /gebäude/i, /münze/i, /truhe/i],
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

  /**
   * Nennt sich ein Kartentext selbst, muss er den Namen SEINER Fassung nennen.
   * Der Fehler, den das verhindert: Der Felshorst erklärte sich mit „keine
   * weitere Zinnenklause" — ein Gebäude, das es im Spiel nicht gibt. Geprüft
   * wird nur die eine Richtung: Wo der klassische Text sich selbst nennt, muss
   * es auch die Theme-Fassung tun. (Umgekehrt darf ein Theme deutlicher sein
   * als das Original — die englische Hütte heißt sich dort „this building".)
   */
  it('Kartentexte nennen sich beim eigenen Namen, nicht beim fremden', () => {
    // Zusammensetzungen und Plural mitnehmen: „Bootshaus" steckt in
    // „Bootshäuser", „Herberge" im Namen „Herberge zum Greif".
    const norm = (s: string) =>
      s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
        .replace(/ß/g, 'ss').replace(/'/g, '');
    const nenntSich = (name: string, text: string) => {
      const t = norm(text);
      if (t.includes(norm(name))) return true; // „High Dome" steht wörtlich da
      // Sonst genügt ein kennzeichnendes Wort des Namens ab 6 Zeichen: Das
      // fängt Beugung und Zusammensetzung („des Denkmals", „Bootshäuser"),
      // lässt aber kurze Allerweltswörter außen vor — „train" steht in jedem
      // Zug-Text und wäre keine Selbstnennung.
      return norm(name).split(/\s+/).some((wort) => wort.length >= 6 && t.includes(wort));
    };
    for (const card of themed) {
      const themed_ = card.themes![id];
      for (const lang of ['de', 'en'] as const) {
        if (!nenntSich(card.name[lang]!, card.text[lang]!)) continue;
        expect(
          nenntSich(themed_.name[lang]!, themed_.text[lang]!),
          `${card.id} (${lang}): Text nennt nicht „${themed_.name[lang]}" — ${themed_.text[lang]}`
        ).toBe(true);
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
