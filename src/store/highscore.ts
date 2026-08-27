// Solo-Bestenliste je Gerät (localStorage). Klassik und Landpartie führen
// GETRENNTE Listen: 5×6 mit Anlieger-Karten erzeugt andere Punkthöhen, ein
// gemeinsames Top-10 wäre bedeutungslos. Einträge ohne mode-Feld stammen aus
// älteren Versionen und zählen als Klassik.

const KEY = 'tinytowns.highscores.v1';
const LIMIT = 10;

export type HighscoreMode = 'classic' | 'land';

export interface HighscoreEntry {
  score: number;
  rank: string;
  date: string; // ISO-Datum des Spiels
  dailyId?: string; // gesetzt bei Tages-Challenge
  /** fehlend = Klassik (Bestandsdaten) */
  mode?: HighscoreMode;
}

function load(): HighscoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as HighscoreEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const inMode = (e: HighscoreEntry, mode: HighscoreMode) =>
  (e.mode ?? 'classic') === mode;

export function highscores(mode: HighscoreMode = 'classic'): HighscoreEntry[] {
  return load()
    .filter((e) => inMode(e, mode))
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT);
}

/** Ergebnis eintragen; gibt die Platzierung (1-basiert) im eigenen Modus
 *  zurück oder null. Gespeichert werden beide Listen gemeinsam, gekappt wird
 *  je Modus. */
export function addHighscore(entry: HighscoreEntry): number | null {
  const mode = entry.mode ?? 'classic';
  const all = [...load(), entry];
  const mine = all.filter((e) => inMode(e, mode)).sort((a, b) => b.score - a.score).slice(0, LIMIT);
  const others = all.filter((e) => !inMode(e, mode));
  try {
    localStorage.setItem(KEY, JSON.stringify([...others, ...mine]));
  } catch {
    // privater Modus — Liste lebt dann nur im Speicher dieser Sitzung
  }
  const pos = mine.indexOf(entry);
  return pos >= 0 ? pos + 1 : null;
}
