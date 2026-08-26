// Ergebnis als Bild — eine quadratische Karte zum Teilen.
//
// Layout und Zeichnen sind getrennt: `wrapLines` und `buildingLines` rechnen
// nur mit einer Messfunktion und sind damit ohne Canvas prüfbar.
// Wie beim Text gilt: KEIN Brett-Layout, das wäre bei gleicher Auslage die
// Lösung der Tages-Challenge.

export const CARD_SIZE = 1080;

export interface CardInfo {
  title: string;
  /** „Tages-Challenge 2026-08-26" oder leer */
  subtitle: string;
  rank: string;
  /** z. B. „42 Punkte" */
  score: string;
  buildings: { name: string; count: number }[];
  footer: string;
}

export interface Palette {
  bg: string;
  panel: string;
  text: string;
  dim: string;
  accent: string;
  /** Schriftfamilie der App — aus dem DOM gelesen, nicht hier festgelegt. */
  font: string;
}

/** Wörter auf Zeilen umbrechen. `measure` liefert die Breite eines Textes. */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (s: string) => number
): string[] {
  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const next = `${line} ${word}`;
    if (measure(next) <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * Die Gebäudezeilen der Karte. Bei vielen verschiedenen Gebäuden wird
 * gekürzt, damit die Karte nicht überläuft — der Rest steht als „+ n weitere".
 */
export function buildingLines(
  buildings: { name: string; count: number }[],
  maxWidth: number,
  measure: (s: string) => number,
  maxLines = 3,
  more = (n: number) => `+ ${n}`
): string[] {
  if (buildings.length === 0) return [];
  const parts = buildings.map((b) => `${b.name} ×${b.count}`);
  for (let keep = parts.length; keep > 0; keep--) {
    const rest = parts.length - keep;
    const text = parts.slice(0, keep).join('  ·  ') + (rest > 0 ? `  ·  ${more(rest)}` : '');
    const lines = wrapLines(text, maxWidth, measure);
    if (lines.length <= maxLines) return lines;
  }
  return [];
}

/** Farben und Schrift des gerade aktiven Themes, damit die Karte zum Spiel passt. */
export function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const pick = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    bg: pick('--bg', '#1e2a38'),
    panel: pick('--bg-panel', '#2a3a4d'),
    text: pick('--text', '#e8eef5'),
    dim: pick('--text-dim', '#9fb0c1'),
    accent: pick('--accent', '#e8b84b'),
    // Eine Quelle statt zwei: Der Stack stand hier als eigene Konstante und
    // konnte auf Android eine andere Schrift ergeben als die App selbst.
    font: css.fontFamily || FALLBACK_FONT
  };
}

const FALLBACK_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export function drawScoreCard(canvas: HTMLCanvasElement, info: CardInfo, p: Palette): void {
  const FONT = p.font || FALLBACK_FONT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('kein 2D-Kontext');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  const pad = 60;
  const box = CARD_SIZE - pad * 2;
  ctx.fillStyle = p.panel;
  ctx.beginPath();
  ctx.roundRect(pad, pad, box, box, 48);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mid = CARD_SIZE / 2;
  const inner = box - 120;

  // Erst alles ausmessen, dann als Block mittig setzen — sonst bleibt unten
  // ein Loch, sobald eine Zeile fehlt (kein Datum, keine Gebäude).
  const fTitle = `700 62px ${FONT}`;
  const fSub = `400 34px ${FONT}`;
  const fScore = `700 132px ${FONT}`;
  const fRank = `600 48px ${FONT}`;
  const fList = `400 32px ${FONT}`;

  ctx.font = fRank;
  const rankLines = wrapLines(info.rank, inner, (t) => ctx.measureText(t).width);
  ctx.font = fList;
  const listLines = buildingLines(info.buildings, inner, (t) => ctx.measureText(t).width);

  type Block = { font: string; color: string; text: string; height: number; gap: number };
  const blocks: Block[] = [
    { font: `400 96px ${FONT}`, color: p.text, text: '🏘', height: 100, gap: 18 },
    { font: fTitle, color: p.text, text: info.title, height: 68, gap: info.subtitle ? 12 : 46 }
  ];
  if (info.subtitle) {
    blocks.push({ font: fSub, color: p.dim, text: info.subtitle, height: 40, gap: 46 });
  }
  blocks.push({ font: fScore, color: p.accent, text: info.score, height: 140, gap: 20 });
  rankLines.forEach((line, i) =>
    blocks.push({
      font: fRank,
      color: p.text,
      text: line,
      height: 58,
      gap: i === rankLines.length - 1 ? (listLines.length ? 34 : 0) : 0
    })
  );
  listLines.forEach((line) =>
    blocks.push({ font: fList, color: p.dim, text: line, height: 44, gap: 0 })
  );

  const total = blocks.reduce((sum, b) => sum + b.height + b.gap, 0);
  let y = (CARD_SIZE - 70 - total) / 2; // 70 = Platz für die Fußzeile
  for (const b of blocks) {
    ctx.font = b.font;
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, mid, y + b.height / 2, inner);
    y += b.height + b.gap;
  }

  // Trennlinie und Fußzeile
  ctx.strokeStyle = p.dim;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(mid - 180, CARD_SIZE - 168);
  ctx.lineTo(mid + 180, CARD_SIZE - 168);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = p.dim;
  ctx.font = `400 28px ${FONT}`;
  ctx.fillText(info.footer, mid, CARD_SIZE - 122, inner);
}

/** Karte als PNG. Gibt null zurück, wenn der Browser nicht mitspielt. */
export async function scoreCardBlob(info: CardInfo, p: Palette): Promise<Blob | null> {
  try {
    const canvas = document.createElement('canvas');
    drawScoreCard(canvas, info, p);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
  } catch {
    return null;
  }
}
