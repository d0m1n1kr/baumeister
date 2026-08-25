import { describe, it, expect } from 'vitest';
import { resLabel } from './helpers';
import { LANGUAGES, TRANSLATIONS } from '../i18n';
import { THEME_RESOURCES } from '../theme';

describe('Marken-Beschriftung', () => {
  it('setzt lange Namen kleiner, kurze bleiben groß', () => {
    expect(resLabel('Holz')).toBe('resLabel');
    expect(resLabel('Elfenholz')).toBe('resLabel');          // 9
    expect(resLabel('Runenstein')).toBe('resLabel long');    // 10
    expect(resLabel('Drachenschuppe')).toBe('resLabel xlong'); // 14
  });

  it('deckt alle Materialnamen aller Sprachen und Themes ab', () => {
    const names: string[] = [];
    for (const { code } of LANGUAGES) names.push(...Object.values(TRANSLATIONS[code].resourceNames));
    for (const theme of Object.values(THEME_RESOURCES)) {
      for (const perLang of Object.values(theme ?? {})) names.push(...Object.values(perLang));
    }
    expect(names.length).toBeGreaterThan(40);
    for (const name of names) {
      // Die Klasse ist immer eine der drei Stufen — und ab 13 Zeichen die
      // kleinste, damit die Marke nicht ausufert.
      expect(['resLabel', 'resLabel long', 'resLabel xlong']).toContain(resLabel(name));
      if (name.length > 12) expect(resLabel(name)).toBe('resLabel xlong');
    }
  });
});
