// Gleich viel Panelhöhe für alle Spielerecken.
//
// Das Panel sitzt unter dem Brett, also ist jede Panelzeile Höhe, die dem
// Brett fehlt. Sein Inhalt hängt aber am Spieler: In der Ansage-Phase trägt
// nur der Baumeister den Materialwähler. Sein Brett war dadurch 285 px groß,
// die der anderen 360 — bei exakt gleich großen Zellen.
//
// Für das Gleis ist das fatal: Es ist EINE Linie je Brettreihe. Bei
// unterschiedlich großen Brettern lag sie entweder quer über einem Brett
// (Mittelwert der Kanten) oder 75 px neben dem kleineren (Außenkante).
//
// Also reservieren alle Panels dieselbe Höhe. Und zwar als HÖCHSTMARKE: Sie
// wächst mit dem größten Bedarf, den diese Partie bisher hatte, und schrumpft
// nicht wieder. Sonst wäre das Brett dauernd in Bewegung — Ansage 285, Runde
// 304, nächste Ansage wieder 285 —, und ein Brett, das bei jedem Phasenwechsel
// seine Größe ändert, ist unruhiger als eines, das ein paar Pixel kleiner ist.
// Nach der ersten Runde steht es fest. Zurückgesetzt wird nur, wenn sich der
// Rahmen wirklich ändert: Fenstergröße, Drehung, neue Partie.
//
// Die Marke gilt für ALLE Ecken, damit die Bretter einer Reihe gleich groß
// sind. Nebeneffekt: Der Tisch bleibt auch in der Ansage-Phase punktsymmetrisch.

/** Ein Panel, wie es für die Rechnung zählt. */
export interface PanelBox {
  /** Höhe, die der Inhalt wirklich braucht (ohne die Reservierung selbst). */
  content: number;
  /** Höhe der Zeile, die sich Panel und Brett teilen. */
  row: number;
}

/** Stufe der Reservierung. Ohne Raster wandert das Brett um einzelne Pixel,
 *  sobald ein Text eine Spur breiter umbricht. */
const STEP = 8;

/**
 * Wie viel Höhe jedes Panel reservieren soll.
 *
 * Rein und ohne DOM, damit die Regel prüfbar ist:
 * - Unter zwei Panels gibt es nichts abzustimmen — 0, also keine Wirkung.
 * - Sonst der größte Bedarf, den irgendein Panel jetzt hat ODER früher hatte
 *   (`current`), aufgerundet auf die Stufe — das ist die Höchstmarke.
 * - Höchstens die Hälfte der kleinsten Zeile: Ein überlanges Panel (fremde
 *   Sprache, Lerntipp) darf dem Brett nicht den Platz nehmen. Der Rest bleibt
 *   scrollbar.
 */
export function reserveFor(panels: PanelBox[], current = 0): number {
  if (panels.length < 2) return 0;
  const need = Math.max(current, ...panels.map((p) => p.content));
  const rows = panels.map((p) => p.row).filter((h) => h > 0);
  const cap = rows.length ? Math.floor(Math.min(...rows) / 2) : Infinity;
  return Math.max(0, Math.min(Math.ceil(need / STEP) * STEP, cap));
}

/**
 * Höhe des Inhalts aus den Kindern, NICHT aus dem Kasten selbst: Der Kasten
 * trägt die Reservierung schon und würde sie sonst als Bedarf zurückmelden —
 * eine Sperrklinke, die nie wieder kleiner wird.
 */
export function contentHeight(el: Element): number {
  let top = Infinity;
  let bottom = -Infinity;
  for (const kid of el.children) {
    const r = kid.getBoundingClientRect();
    if (r.height === 0) continue;
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  return bottom > top ? bottom - top : 0;
}

class PanelReserve {
  /** Reservierte Panelhöhe in px — 0, solange nichts abzustimmen ist. */
  px = $state(0);

  /**
   * Nachmessen. `fresh` verwirft die bisherige Höchstmarke — dafür gibt es
   * genau einen Grund: Der Rahmen selbst hat sich geändert (Fenstergröße,
   * Drehung, neue Partie), die alte Marke gehört zu einem anderen Layout.
   */
  measure(fresh = false): void {
    if (typeof document === 'undefined') return;
    const panels = [...document.querySelectorAll<HTMLElement>('[data-panel]')];
    this.px = reserveFor(
      panels.map((el) => ({
        content: contentHeight(el),
        row: el.parentElement?.getBoundingClientRect().height ?? 0
      })),
      fresh ? 0 : this.px
    );
  }
}

export const panelReserve = new PanelReserve();
