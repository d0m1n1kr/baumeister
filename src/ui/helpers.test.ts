import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
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

describe('Safe-Area der installierten PWA', () => {
  const css = readFileSync('src/app.css', 'utf8');

  it('deckelt den unteren Inset — die PWA meldet teils ein Vielfaches', () => {
    // Ohne Deckel blieb unten ein toter Streifen in Höhe des gemeldeten
    // Insets (gemessen ~89px statt der dokumentierten 34pt).
    expect(css).toMatch(/--safe-bottom:\s*min\(env\(safe-area-inset-bottom[^)]*\),\s*34px\)/);
  });

  it('hängt die App-Hülle am Layout-Viewport, nicht an einer Viewport-Einheit', () => {
    // 100dvh meldet in der installierten iOS-PWA nicht den ganzen Bildschirm.
    const app = css.slice(css.indexOf('#app {'), css.indexOf('button {'));
    expect(app).toContain('position: fixed');
    expect(app).toContain('inset: 0');
    expect(app).not.toMatch(/height:\s*100[ds]?vh/);
  });

  it('reserviert den unteren Rand nur dort, wo Inhalt anklebt', () => {
    // Im #app selbst wäre er falsch: Er würde jeden Screen beschneiden.
    const app = css.slice(css.indexOf('#app {'), css.indexOf('button {'));
    expect(app).not.toContain('padding-bottom');
  });
});
