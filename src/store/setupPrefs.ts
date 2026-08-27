// Gemerkte Einstellungen des Startbildschirms.
//
// Wer immer zu viert mit Fortune spielt, soll das nicht jedes Mal neu
// zusammenklicken. Wie Spielernamen, Ton, Thema und Lernmodus gehören diese
// Auswahlen zum GERÄT, nicht zum Spielstand — die Engine weiß nichts davon.
//
// Nicht gemerkt wird die Sitzordnung: Sie hängt an der Spielerzahl und wird
// beim Wechsel ohnehin neu gesetzt. Der Tag der Tages-Challenge ebenfalls
// nicht — der ist immer „heute", sonst spielte man ungefragt Vorgestern.
//
// `sanitize` ist rein und ohne Browser-Abhängigkeit, damit es geprüft werden
// kann: Es entscheidet, was aus fremden oder alten Daten übernommen wird.

import { SETS } from '../data/sets';

const KEY = 'tinytowns.setup.v1';

export type SoloMode = 'free' | 'daily' | 'learn';

export interface SetupPrefs {
  /** Spielerzahl 1–4. */
  count: number;
  /** Mehrgerätemodus (nur ab 2 Spielern wirksam). */
  multiDevice: boolean;
  /** Solo-Variante: freies Spiel, Tages-Challenge oder Lernspiel. */
  soloMode: SoloMode;
  /** Landpartie: 6×6 mit Landschaft. */
  land: boolean;
  useMonuments: boolean;
  /** Gewählte Erweiterungen OHNE 'base' (das ist immer dabei). */
  sets: string[];
  townHall: boolean;
  train: boolean;
  cavern: boolean;
}

export const DEFAULTS: SetupPrefs = {
  count: 4,
  multiDevice: false,
  soloMode: 'free',
  land: false,
  useMonuments: true,
  sets: [],
  townHall: false,
  train: false,
  cavern: false
};

const SOLO_MODES: SoloMode[] = ['free', 'daily', 'learn'];
/** Wählbare Erweiterungen — 'base' ist Pflicht und steht nie in der Liste. */
const WAEHLBAR = SETS.filter((s) => !s.core).map((s) => s.id);

/**
 * Aus beliebigem gespeicherten Inhalt gültige Einstellungen machen. Alles
 * Unbekannte fällt auf den Standard zurück: Ein alter Eintrag mit einer
 * Erweiterung, die es nicht mehr gibt, darf den Startbildschirm nicht kippen.
 */
export function sanitize(raw: unknown): SetupPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const count =
    typeof o.count === 'number' && Number.isInteger(o.count) && o.count >= 1 && o.count <= 4
      ? o.count
      : DEFAULTS.count;
  return {
    count,
    multiDevice: bool(o.multiDevice, DEFAULTS.multiDevice),
    soloMode: SOLO_MODES.includes(o.soloMode as SoloMode)
      ? (o.soloMode as SoloMode)
      : DEFAULTS.soloMode,
    land: bool(o.land, DEFAULTS.land),
    useMonuments: bool(o.useMonuments, DEFAULTS.useMonuments),
    sets: Array.isArray(o.sets)
      ? [...new Set(o.sets.filter((s): s is string => typeof s === 'string' && WAEHLBAR.includes(s)))]
      : [...DEFAULTS.sets],
    townHall: bool(o.townHall, DEFAULTS.townHall),
    train: bool(o.train, DEFAULTS.train),
    cavern: bool(o.cavern, DEFAULTS.cavern)
  };
}

export function loadPrefs(): SetupPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : {});
  } catch {
    // privater Modus oder kaputter Inhalt — dann mit den Standardwerten
    return sanitize({});
  }
}

/** Merkt die Einstellungen. Alles auf Standard? Dann den Eintrag entfernen. */
export function savePrefs(prefs: SetupPrefs): void {
  const clean = sanitize(prefs);
  try {
    if (JSON.stringify(clean) === JSON.stringify(DEFAULTS)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // Speicher voll / privater Modus — die Partie läuft trotzdem
  }
}
