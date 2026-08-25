// Mehrsprachigkeit: Die Sprache wird EINMAL beim App-Start bestimmt
// (gespeicherte Wahl → Browser-Sprachen → Englisch) und bleibt für die
// Laufzeit konstant — der Umschalter speichert die Wahl und lädt neu.
// Das hält alle 18 Komponenten frei von Reaktivitäts-Sonderfällen;
// Spielstand und Mehrgeräte-Sitzung überleben den Reload ohnehin.

import type { CardDef } from '../engine/types';
import { theme, themedResourceNames, themedStrings } from '../theme';
import { de } from './de';
import { en } from './en';
import { fr } from './fr';
import { es } from './es';
import { it } from './it';
import { nl } from './nl';
import { pt } from './pt';
import { pl } from './pl';

/** Alle Sprachen müssen exakt die Schlüssel der Referenz (Deutsch) liefern. */
export type Translation = typeof de;

export const TRANSLATIONS: Record<string, Translation> = { de, en, fr, es, it, nl, pt, pl };

/** Für den Umschalter: Code + Eigenname der Sprache. */
export const LANGUAGES = Object.entries(TRANSLATIONS).map(([code, tr]) => ({
  code,
  name: tr.languageName
}));

const STORAGE_KEY = 'tinytowns.lang';

/**
 * Sprachwahl (pure Funktion, testbar): gespeicherte gültige Wahl gewinnt,
 * sonst die erste Browser-Sprache mit passendem Präfix, sonst Englisch.
 */
export function pickLanguage(stored: string | null, browserLangs: readonly string[]): string {
  if (stored && stored in TRANSLATIONS) return stored;
  for (const b of browserLangs) {
    const prefix = b.toLowerCase().split('-')[0];
    if (prefix in TRANSLATIONS) return prefix;
  }
  return 'en';
}

function detect(): string {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // privater Modus o. Ä. — dann entscheidet der Browser
  }
  const langs = typeof navigator !== 'undefined'
    ? (navigator.languages?.length ? navigator.languages : [navigator.language])
    : [];
  return pickLanguage(stored, langs.filter(Boolean) as string[]);
}

/** Aktive Sprache dieser Laufzeit. */
export const lang = detect();

/** Die aktiven UI-Texte. */
export const t: Translation = TRANSLATIONS[lang];

if (typeof document !== 'undefined') {
  document.documentElement.lang = lang;
}

// Theme-Überlagerung: Ressourcen heißen im Mars-Theme anders (gleiche IDs
// und Farben) — einmalige Überlagerung hält alle Aufrufstellen unverändert.
{
  const themed = themedResourceNames(lang);
  if (themed) t.resourceNames = { ...t.resourceNames, ...themed };
  // UI-Texte des Themes (Münzen → Energiezellen usw.): sets und help werden
  // schlüsselweise gemischt, alles andere ersetzt den Eintrag direkt.
  const strings = themedStrings(lang);
  if (strings) {
    const target = t as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(strings)) {
      if (key === 'sets' || key === 'help') {
        Object.assign(target[key] as Record<string, unknown>, value);
      } else {
        target[key] = value;
      }
    }
  }
}

/** Umschalter: Wahl speichern und mit der neuen Sprache neu laden. */
export function setLanguage(code: string): void {
  if (!(code in TRANSLATIONS)) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Reload — besser als nichts
  }
  location.reload();
}

/** Kartenname in der aktiven Sprache (Theme zuerst; Fallback: Englisch → Deutsch). */
export function cardName(card: CardDef): string {
  const th = theme !== 'classic' ? card.themes?.[theme]?.name : undefined;
  if (th) return th[lang] ?? th.en ?? th.de;
  return card.name[lang] ?? card.name.en ?? card.name.de;
}

/** Kartentext in der aktiven Sprache (Theme zuerst; Fallback: Englisch → Deutsch). */
export function cardText(card: CardDef): string {
  const th = theme !== 'classic' ? card.themes?.[theme]?.text : undefined;
  if (th) return th[lang] ?? th.en ?? th.de;
  return card.text[lang] ?? card.text.en ?? card.text.de;
}

/**
 * Engine- und Netz-Meldungen entstehen als deutsche Originaltexte —
 * hier werden sie für die Anzeige übersetzt (unbekannte bleiben unverändert).
 */
export function translateError(msg: string): string {
  return t.errors[msg] ?? msg;
}
