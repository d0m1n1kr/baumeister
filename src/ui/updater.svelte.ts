// Update-Verwaltung an EINER Stelle: Registrierung des Service Workers,
// regelmäßige Prüfung und der Zustand „neue Version wartet".
//
// Warum als Modul und nicht in der Banner-Komponente: Ein weggetippter Hinweis
// darf keine Sackgasse sein. Über den Versionsstempel im Fußbereich lässt sich
// jederzeit von Hand prüfen und aktualisieren — nötig, weil ein lange offener
// Browser-Tab sonst auf seiner alten Fassung sitzen bleibt.

import { useRegisterSW } from 'virtual:pwa-register/svelte';

const CHECK_INTERVAL = 15 * 60 * 1000;

let waiting = $state(false);
let checking = $state(false);
/** Kurz nach einer Prüfung ohne Fund wahr — für die Rückmeldung „aktuell". */
let fresh = $state(false);
let freshTimer: ReturnType<typeof setTimeout> | undefined;
let registration: ServiceWorkerRegistration | null = null;

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_swUrl, reg) {
    registration = reg ?? null;
    if (!reg) return;
    // Prüfen beim Start, alle 15 Minuten und bei jeder Rückkehr in die App
    setInterval(() => void reg.update().catch(() => {}), CHECK_INTERVAL);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void reg.update().catch(() => {});
    });
  }
});

needRefresh.subscribe((v) => (waiting = v));

export const updater = {
  /** Eine neue Fassung ist heruntergeladen und wartet auf den Neustart. */
  get waiting(): boolean {
    return waiting;
  },
  get checking(): boolean {
    return checking;
  },
  /** Kurz nach einer Prüfung ohne Fund wahr — für „bereits aktuell". */
  get checkedRecently(): boolean {
    return fresh;
  },

  /** Von Hand nach einer neuen Fassung sehen. */
  async check(): Promise<void> {
    if (checking) return;
    checking = true;
    fresh = false;
    if (freshTimer) clearTimeout(freshTimer);
    try {
      await registration?.update();
      // Ein Fund meldet sich über `needRefresh` erst nach der Installation —
      // kurz warten, sonst stünde „aktuell" neben dem Update-Hinweis.
      await new Promise((r) => setTimeout(r, 1200));
    } catch {
      // offline oder Server nicht erreichbar — dann bleibt es beim Alten
    }
    checking = false;
    if (!waiting) {
      fresh = true;
      freshTimer = setTimeout(() => (fresh = false), 6000);
    }
  },

  /** Neue Fassung aktivieren und neu laden (der Spielstand übersteht das). */
  async apply(): Promise<void> {
    await updateServiceWorker(true);
    location.reload();
  }
};
