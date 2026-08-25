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

/**
 * Mars: UI-Texte rund um Münzen (→ Energiezellen), Truhe (→ Akku) und
 * Tiny-Trees-Samen (→ Sporen/Flechten). Nur de+en — andere Sprachen fallen
 * wie bei den Kartentexten aufs Englische zurück. `sets` und `help` werden
 * schlüsselweise in die aktiven Texte gemischt.
 */
export const THEME_STRINGS: Partial<Record<ThemeId, Record<string, Record<string, unknown>>>> = {
  mars: {
    de: {
      coins: 'Energiezellen',
      coinIcon: '🔋',
      coinSwap: 'Energiezelle: anderes Material',
      coinSwapHint: 'Zahle 1 Energiezelle und nimm ein beliebiges anderes Material',
      masonsTitle: 'Druckergilde: je 1 Energiezelle → 1 Modul',
      promenadeTitle: 'Kuppelpromenade: Energiezellen auf leere Felder legen',
      museumSell: 'Angesagtes Material zurückgeben (+1 Energiezelle)',
      cathedralTitle: 'Solardom: 3 Energiezellen zahlen?',
      cathedralPay: '3 Energiezellen zahlen',
      okaverTitle: 'Energiedepot: Akku voll → Gratis-Habitat?',
      oddityTakeTitle: 'Meteoritenladen: Material nehmen (+1 Energiezelle für dich)',
      seedPlaceHint: 'Tippe ein Feld für deine Spore',
      seedBonusTitle: 'Spore überbaut: Gratis-Material wählen',
      tree: 'Flechte',
      sets: {
        fortune: {
          name: 'Fortune',
          description: 'Energiezellen: 1 Zelle bei 2+ Bauten pro Runde; 1 Zelle zahlen, um ein anderes Material zu nehmen. 12 Module + 10 Monumente.'
        },
        tiny_trees: {
          name: 'Tiny Trees',
          description: 'Mini-Erweiterung: Jeder startet mit einer Spore. Überbauen bringt ein Gratis-Material; als letzter freier Platz wächst sie zur Flechte (2 Punkte).'
        }
      },
      help: {
        fortuneTitle: 'Erweiterung: Fortune (Energiezellen)',
        fortuneSteps: [
          'Baust du in einer Runde 2 oder mehr Module (mit Materialentfernen), erhältst du 1 Energiezelle — der Akku fasst höchstens 4 (manche Monumente geben 1 Extra-Platz).',
          'Bei fremder Ansage kannst du 1 Energiezelle zahlen und stattdessen ein beliebiges anderes Material nehmen (🔋-Knopf am Material-Chip).',
          'Am Spielende ist jede Energiezelle im Akku 1 Punkt wert.',
          'Dazu kommen 12 Fortune-Module und 10 Monumente mit Energie-Effekten — alle nach den offiziellen Kartentexten umgesetzt.'
        ],
        treesTitle: 'Erweiterung: Tiny Trees (Sporen)',
        treesSteps: [
          'Jeder Spieler legt zu Beginn eine Spore auf ein freies Feld seines Bretts.',
          'Wird die Spore überbaut, wählst du ein Gratis-Material und platzierst es sofort.',
          'Bleibt die Spore bis zum Schluss als letztes unbebautes Feld liegen, wächst sie zur Flechte: 2 Punkte.'
        ]
      }
    },
    en: {
      coins: 'Power cells',
      coinIcon: '🔋',
      coinSwap: 'Power cell: different resource',
      coinSwapHint: 'Pay 1 power cell and take any other resource',
      masonsTitle: "Printers' Guild: 1 power cell → 1 module",
      promenadeTitle: 'Dome Promenade: place power cells on empty squares',
      museumSell: 'Return the named resource (+1 power cell)',
      cathedralTitle: 'Solar Dome: pay 3 power cells?',
      cathedralPay: 'Pay 3 power cells',
      okaverTitle: 'Power Depot: battery full → free habitat?',
      oddityTakeTitle: 'Meteorite Shop: take a resource (+1 power cell for you)',
      seedPlaceHint: 'Tap a square for your spore',
      seedBonusTitle: 'Spore built over: choose a free resource',
      tree: 'Lichen',
      sets: {
        fortune: {
          name: 'Fortune',
          description: 'Power cells: 1 cell for 2+ builds per round; pay 1 cell to take a different resource. 12 modules + 10 monuments.'
        },
        tiny_trees: {
          name: 'Tiny Trees',
          description: 'Mini expansion: everyone starts with a spore. Building over it grants a free resource; as the last empty square it grows into a lichen (2 points).'
        }
      },
      help: {
        fortuneTitle: 'Expansion: Fortune (power cells)',
        fortuneSteps: [
          'Construct 2 or more modules in a round (removing resources) to gain 1 power cell — the battery holds at most 4 (some monuments add 1 extra slot).',
          "On another player's naming you may pay 1 power cell and take any other resource instead (🔋 button on the resource chip).",
          'At game end every power cell in the battery is worth 1 point.',
          'Plus 12 Fortune modules and 10 monuments with power effects — all implemented from the official card texts.'
        ],
        treesTitle: 'Expansion: Tiny Trees (spores)',
        treesSteps: [
          'Each player starts by placing a spore on an empty square of their board.',
          'When the spore is built over, choose a free resource and place it immediately.',
          'If the spore remains as the last empty square, it grows into a lichen: 2 points.'
        ]
      }
    }
  }
};

/** Themen-UI-Texte für die aktive Sprache (null = klassisch lassen). */
export function themedStrings(lang: string): Record<string, unknown> | null {
  const perLang = THEME_STRINGS[theme];
  if (!perLang) return null;
  return perLang[lang] ?? perLang.en ?? null;
}
