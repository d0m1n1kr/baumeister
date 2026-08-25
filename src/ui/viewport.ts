// Messhilfen für die Höhen-Frage der installierten iOS-PWA.
//
// Am Gerät gemessen: Bildschirm 402×874, gemeldeter Viewport 402×812, oberer
// Inset 62 — die Differenz IST der obere Inset. In v2.4.5 hat die Hülle darauf
// hin auf Bildschirmhöhe gewachsen; das war falsch: Der Bereich unter dem
// Layout-Viewport wird nicht gezeichnet, Inhalt dort verschwindet hinter dem
// Hintergrund. Die Hülle bleibt daher am Layout-Viewport (CSS `inset: 0`).
//
// Offen ist nur noch, WO dieser Viewport auf dem Bildschirm sitzt — davon
// hängt ab, ob der untere Rand (Home-Indicator) überhaupt freigehalten werden
// muss. Das beantwortet die Messanzeige (siehe LayoutProbe.svelte).

/** Höhe, die ein CSS-Ausdruck ergibt (misst z. B. `env()` oder `100lvh`). */
export function probeHeight(css: string): number {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none';
  el.style.height = css;
  document.body.appendChild(el);
  const h = el.getBoundingClientRect().height;
  el.remove();
  return Math.round(h);
}

/**
 * Markiert die installierte PWA, die ihre Safe-Area-Insets selbst verwaltet
 * (viewport-fit=cover) — erkennbar am gemeldeten OBEREN Inset: Im Browser ist
 * er 0 (am Gerät nachgemessen, iOS-Safari 0/0), in der installierten PWA 62.
 *
 * Warum das nötig ist: Mit `height: 100%` blieben html/body am kleinen
 * Viewport (am iPhone 812 statt 874 — 100 % einer Höhe, die iOS ohne die
 * Insets meldet). Die fehlenden 62 px lagen unten brach, und fixierte
 * Elemente wurden dort nicht mehr gezeichnet. Dürfen html/body dagegen
 * 100vh hoch sein, meldet iOS auch innerHeight/dvh als 874 — am Gerät mit
 * einem Versuchsbalken nachgewiesen. Im Browser wäre 100vh falsch (dort ist
 * es die Höhe OHNE Leisten), deshalb die Bindung an den Inset.
 */
export function markCoverViewport(): void {
  if (probeHeight('var(--safe-raw-top)') > 0) document.documentElement.dataset.cover = '';
  else delete document.documentElement.dataset.cover;
}

/** Lage des Viewports auf dem Bildschirm — für die Messanzeige. */
export function viewportFacts(): string[] {
  const vv = window.visualViewport;
  return [
    `screen ${screen.width}×${screen.height} dpr ${window.devicePixelRatio}`,
    `inner ${innerWidth}×${innerHeight} outer ${outerWidth}×${outerHeight}`,
    `screenX ${window.screenX} screenY ${window.screenY} client ${document.documentElement.clientHeight}`,
    vv
      ? `visual ${Math.round(vv.width)}×${Math.round(vv.height)} offTop ${Math.round(vv.offsetTop)}`
      : 'visual —',
    `inset oben ${probeHeight('var(--safe-raw-top)')} unten roh ${probeHeight(
      'var(--safe-raw-bottom)'
    )} genutzt ${probeHeight('var(--safe-bottom)')}`,
    `vh ${probeHeight('100vh')} svh ${probeHeight('100svh')} lvh ${probeHeight(
      '100lvh'
    )} dvh ${probeHeight('100dvh')}`,
    `cover ${document.documentElement.dataset.cover !== undefined}`
  ];
}
