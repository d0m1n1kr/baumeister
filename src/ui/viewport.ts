// Höhe der App-Hülle. Normalerweise erledigt das CSS (`inset: 0`) — außer in
// der installierten iOS-PWA: Dort melden ALLE Höhenquellen (innerHeight,
// clientHeight, visualViewport, vh/svh/lvh/dvh) den Bildschirm MINUS dem
// oberen Safe-Area-Inset, obwohl die Web-View mit viewport-fit=cover den
// ganzen Bildschirm bedeckt. Am Gerät gemessen: Bildschirm 874, gemeldet 812,
// oberer Inset 62 — die fehlenden 62 px lagen unten brach (plus dem
// reservierten Home-Indicator-Rand ergab das den toten Streifen).
//
// Erkannt wird genau diese Signatur: „Bildschirmhöhe − gemeldete Höhe == oberer
// Safe-Area-Inset, und der ist größer als 0". Sie tritt nur auf, wenn die App
// die Insets selbst verwaltet (viewport-fit=cover ohne Browser-Leisten) — im
// Browser ist der obere Inset 0 (am Gerät nachgemessen), und die Differenz zum
// Bildschirm sind dort die Leisten. In allen anderen Fällen bleibt CSS
// zuständig; die Bildschirmhöhe wäre dort grob falsch.

const KEY = '--app-h';

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

export interface AppHeight {
  /** Gesetzte Höhe in px, oder null: dann bleibt CSS (`inset: 0`) zuständig. */
  height: number | null;
  reason: string;
}

export function measureAppHeight(): AppHeight {
  const inner = Math.round(window.visualViewport?.height ?? window.innerHeight);
  const topInset = probeHeight('var(--safe-raw-top)');
  const screenH = Math.round(screen.height);
  if (topInset > 0 && screenH > inner && Math.abs(screenH - inner - topInset) <= 2) {
    return { height: screenH, reason: `Bildschirm (+${screenH - inner})` };
  }
  return { height: null, reason: topInset > 0 ? 'Viewport' : 'ohne Inset' };
}

/** Setzt --app-h und hält es aktuell. Ohne Befund bleibt die Variable leer. */
export function syncAppHeight(): void {
  const apply = () => {
    const { height } = measureAppHeight();
    if (height) document.documentElement.style.setProperty(KEY, `${height}px`);
    else document.documentElement.style.removeProperty(KEY);
  };
  apply();
  addEventListener('resize', apply);
  addEventListener('orientationchange', apply);
  addEventListener('pageshow', apply);
  window.visualViewport?.addEventListener('resize', apply);
}
