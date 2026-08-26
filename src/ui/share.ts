// Ergebnis teilen — Text bauen und über den passenden Kanal hinausgeben.
//
// Der Textbau ist bewusst rein und ohne Browser-Abhängigkeit, damit er
// geprüft werden kann. Bewusst OHNE Brett-Layout: Bei der Tages-Challenge
// spielen alle dieselbe Auslage, ein Bild der fertigen Stadt wäre die Lösung.

export interface ShareResult {
  /** 'shared' = Teilen-Blatt, 'copied' = Zwischenablage, 'failed' = nichts ging */
  via: 'shared' | 'copied' | 'failed';
}

export interface ShareInfo {
  title: string;
  /** Rangbezeichnung, z. B. „Bürgermeisterin" */
  rank: string;
  score: number;
  points: string;
  /** Tages-Challenge-Kennung (YYYY-MM-DD), sonst undefined */
  dailyId?: string;
  dailyLabel: string;
  /** Anzahl gebauter Gebäude je Art, absteigend — ohne Position auf dem Brett */
  buildings: { name: string; count: number }[];
  url: string;
}

/** Link, der beim Empfänger genau dieselbe Tages-Challenge öffnet. */
export function dailyUrl(dailyId: string, href: string): string {
  const url = new URL(href);
  url.hash = `daily=${dailyId}`;
  return url.toString();
}

/** Tages-Challenge aus der Adresszeile (`#daily=2026-08-26`). */
export function dailyIdFromHash(hash: string): string | null {
  const m = /[#&]daily=(\d{4}-\d{2}-\d{2})/.exec(hash);
  return m ? m[1] : null;
}

export function shareText(info: ShareInfo): string {
  const head = info.dailyId
    ? `🏘 ${info.title} — ${info.dailyLabel} ${info.dailyId}`
    : `🏘 ${info.title}`;
  const lines = [head, `🏅 ${info.rank} · ${info.score} ${info.points}`];
  if (info.buildings.length > 0) {
    lines.push(info.buildings.map((b) => `${b.name} ×${b.count}`).join(' · '));
  }
  lines.push(info.url);
  return lines.join('\n');
}

/**
 * Teilen versuchen, sonst in die Zwischenablage. `navigator.share` gibt es
 * nur auf Mobilgeräten und in Safari — überall sonst ist Kopieren der Weg.
 * Ein Abbruch durch den Nutzer ist kein Fehler und wird still geschluckt.
 */
export async function shareOrCopy(text: string, title: string): Promise<ShareResult> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title, text });
      return { via: 'shared' };
    } catch (e) {
      // AbortError = Nutzer hat das Blatt geschlossen; dann NICHT heimlich kopieren
      if (e instanceof Error && e.name === 'AbortError') return { via: 'shared' };
      // alles andere (z. B. NotAllowedError) fällt auf die Zwischenablage zurück
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return { via: 'copied' };
  } catch {
    return { via: 'failed' };
  }
}
