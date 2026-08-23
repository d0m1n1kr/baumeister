// Bildschirmsperre während der Partie verhindern.
//
// Unter iOS beendet das Sperren des Displays die App-Ausführung und damit jede
// Verbindung — das ist die häufigste Ursache für abgerissene Mehrgeräte-Partien.
// Von iOS Safari ab 16.4 unterstützt; ältere Geräte ignorieren es stillschweigend.

let sentinel: WakeLockSentinel | null = null;

async function acquire(): Promise<void> {
  if (sentinel || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Kein Wake Lock möglich (z. B. Akkusparmodus) — kein Grund abzubrechen
  }
}

function release(): void {
  void sentinel?.release().catch(() => {});
  sentinel = null;
}

/**
 * Hält den Bildschirm wach und fordert die Sperre nach Rückkehr in den
 * Vordergrund erneut an (das System gibt sie beim Wegblenden frei).
 * Gibt eine Aufräumfunktion zurück.
 */
export function keepScreenAwake(): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') void acquire();
  };
  void acquire();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    release();
  };
}
