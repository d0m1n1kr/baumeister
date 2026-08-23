// Solo-Bestenliste je Gerät (localStorage) — getrennt nach freiem Solo und
// Tages-Challenge, damit die Vergleichbarkeit stimmt.

const KEY = 'tinytowns.highscores.v1';
const LIMIT = 10;

export interface HighscoreEntry {
  score: number;
  rank: string;
  date: string; // ISO-Datum des Spiels
  dailyId?: string; // gesetzt bei Tages-Challenge
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

export function highscores(): HighscoreEntry[] {
  return load().sort((a, b) => b.score - a.score).slice(0, LIMIT);
}

/** Ergebnis eintragen; gibt die Platzierung (1-basiert) zurück oder null. */
export function addHighscore(entry: HighscoreEntry): number | null {
  const list = [...load(), entry].sort((a, b) => b.score - a.score).slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // privater Modus — Liste lebt dann nur im Speicher dieser Sitzung
  }
  const pos = list.indexOf(entry);
  return pos >= 0 ? pos + 1 : null;
}
