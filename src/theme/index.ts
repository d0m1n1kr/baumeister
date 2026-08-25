// Themes: reine Anzeige-Ebene über den unveränderten Spielregeln. Die Engine
// rechnet nur mit Karten- und Ressourcen-IDs — ein Theme tauscht Namen, Texte
// und Artwork. Anzeige-Präferenz je Gerät (wie die Sprache): Im Mehrgeräte-
// modus kann der Host klassisch spielen, während ein Gast die Mars-Kolonie
// sieht — derselbe Spielzustand.

import type { Resource } from '../engine/types';

export type ThemeId = 'classic' | 'mars';

export const THEMES: { id: ThemeId }[] = [{ id: 'classic' }, { id: 'mars' }];

const STORAGE_KEY = 'tinytowns.theme';

/** Gültige gespeicherte Wahl oder Standard (klassisch). */
export function pickTheme(stored: string | null): ThemeId {
  return stored === 'mars' ? 'mars' : 'classic';
}

function detect(): ThemeId {
  try {
    return pickTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'classic';
  }
}

export const theme: ThemeId = detect();

// data-theme steuert die CSS-Palette (index.html setzt es zusätzlich schon
// vor dem ersten Paint, damit nichts kurz klassisch aufblitzt)
if (typeof document !== 'undefined' && theme !== 'classic') {
  document.documentElement.dataset.theme = theme;
}

/** Theme wechseln: speichern und neu laden (Spielstand und Sitzung überleben
 *  den Reload — wie beim Sprachwechsel). */
export function setTheme(id: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // privater Modus — dann eben nur bis zum Reload
  }
  location.reload();
}

/** Mars: Ressourcen-Namen (gleiche Farben und IDs — Holz→Regolith usw.).
 *  Sprachen ohne eigene Übersetzung fallen auf Englisch zurück. */
export const THEME_RESOURCES: Partial<Record<ThemeId, Record<string, Record<Resource, string>>>> = {
  mars: {
    de: { wood: 'Regolith', brick: 'Eisen', stone: 'Titan', wheat: 'Nahrung', glass: 'Eis' },
    en: { wood: 'Regolith', brick: 'Iron', stone: 'Titanium', wheat: 'Food', glass: 'Ice' }
  }
};

/** Themen-Ressourcennamen für die aktive Sprache (null = klassisch lassen). */
export function themedResourceNames(lang: string): Record<Resource, string> | null {
  const perLang = THEME_RESOURCES[theme];
  if (!perLang) return null;
  return perLang[lang] ?? perLang.en ?? null;
}
