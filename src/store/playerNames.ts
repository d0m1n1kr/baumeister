// Gemerkte Spielernamen dieses Geräts.
//
// Wer zu Hause immer mit denselben Leuten spielt, soll die Namen einmal
// eintippen und nicht jedes Mal wieder. Wie die anderen Präferenzen
// (Ton, Thema, Detail-, Lernmodus) liegen sie im localStorage und gehören zum
// Gerät, nicht zum Spielstand — die Engine weiß nichts davon.
//
// `sanitize` ist rein und ohne Browser-Abhängigkeit, damit es geprüft werden
// kann: Es entscheidet, was aus fremden oder alten Daten übernommen wird.

const KEY = 'tinytowns.names.v1';
export const MAX_PLAYERS = 4;
/** Wie im Eingabefeld — längere Namen sprengen die Spielerkarte. */
export const NAME_MAX = 14;

/**
 * Aus beliebigem gespeicherten Inhalt genau MAX_PLAYERS Einträge machen.
 * Leere Plätze bleiben leer: Dann greift im Spiel der Standardname.
 */
export function sanitize(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: MAX_PLAYERS }, (_, i) => {
    const v = list[i];
    return typeof v === 'string' ? v.trim().slice(0, NAME_MAX) : '';
  });
}

export function loadNames(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : []);
  } catch {
    // privater Modus oder kaputter Inhalt — dann ohne gemerkte Namen
    return sanitize([]);
  }
}

/** Merkt die Namen. Alles leer? Dann den Eintrag ganz entfernen. */
export function saveNames(names: string[]): void {
  const clean = sanitize(names);
  try {
    if (clean.every((n) => n === '')) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // Speicher voll / privater Modus — die Partie läuft trotzdem
  }
}
