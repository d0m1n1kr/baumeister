// „Als App installieren" im Startbildschirm — zwei Wege, weil die Browser
// sich hier grundlegend unterscheiden:
//
//  • Chromium (Android, Desktop) feuert `beforeinstallprompt`, sobald die App
//    installierbar ist. Das Ereignis wird gemerkt und auf Tipp abgespielt.
//  • iOS/iPadOS bietet dafür KEINE Schnittstelle: Apples WebKit feuert das
//    Ereignis nicht und `prompt()` gibt es nicht. Dort bleibt nur eine
//    Anleitung („Teilen → Zum Home-Bildschirm").
//
// Läuft die App schon installiert, ist gar nichts zu tun — dann meldet
// `display-mode: standalone` (bzw. `navigator.standalone` auf älterem iOS).

const KEY = 'tinytowns.install.hint';

/** Chromium-Ereignis; in den TS-Bibliotheken (noch) nicht typisiert. */
type InstallPromptEvent = Event & { prompt(): Promise<void> };

function readHint(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'; // Standard: zeigen
  } catch {
    return true;
  }
}

function store(value: string): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // privater Modus — die Wahl gilt dann nur für diese Sitzung
  }
}

/** Läuft die App bereits als installierte PWA? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosLegacy = (navigator as { standalone?: boolean }).standalone === true;
  return iosLegacy || window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * iOS/iPadOS erkennen — reine Funktion, damit sie testbar bleibt. Auf dem iPad
 * meldet sich Safari seit iPadOS 13 als „Macintosh"; verräterisch ist erst die
 * Kombination mit Mehrfingerberührung, denn Macs haben keinen Touchscreen.
 */
export function isIos(ua: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

let hint = $state(readHint());
let promptEvent = $state<InstallPromptEvent | null>(null);
let installed = $state(false);
let showSteps = $state(false);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // sonst zeigt Chromium seine eigene Leiste
    promptEvent = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    hint = false;
  });
}

export const install = {
  /**
   * Wie kann hier installiert werden? `null` heißt: gar nicht — schon
   * installiert, oder ein Browser ohne diesen Weg (etwa Firefox am Rechner).
   */
  get kind(): 'prompt' | 'ios' | null {
    if (installed || isStandalone()) return null;
    if (promptEvent) return 'prompt';
    if (typeof navigator === 'undefined') return null;
    return isIos(navigator.userAgent, navigator.maxTouchPoints) ? 'ios' : null;
  },

  /** Hinweis im Startbildschirm noch zeigen? */
  get show(): boolean {
    return hint && this.kind !== null;
  },

  /** Auf iOS: Ist die Anleitung aufgeklappt? */
  get steps(): boolean {
    return showSteps;
  },

  /**
   * Installieren anstoßen. Auf Chromium öffnet das den Systemdialog; auf iOS
   * klappt die Anleitung auf, weil es dort keinen Dialog gibt.
   */
  async run(): Promise<void> {
    if (this.kind === 'ios') {
      showSteps = !showSteps;
      return;
    }
    const event = promptEvent;
    if (!event) return;
    promptEvent = null; // ein Ereignis lässt sich nur einmal abspielen
    try {
      await event.prompt();
    } catch {
      // abgelehnt oder nicht mehr gültig — der Hinweis verschwindet einfach
    }
  },

  /** Weggeklickt — beim nächsten Start nicht mehr zeigen. */
  dismiss(): void {
    hint = false;
    showSteps = false;
    store('0');
  }
};
