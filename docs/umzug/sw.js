// Selbstzerstörender Service Worker für die ALTE Adresse.
//
// Warum es ihn braucht: Wer das Spiel unter /tiny-towns/ installiert oder auch
// nur besucht hatte, trägt dort einen Service Worker mit vollem Cache. Der
// fängt jede Navigation ab und beantwortet sie aus dem Cache — die Weiche in
// index.html wird nie geladen, die alte App lebt weiter. Eine gelöschte
// sw.js hilft nicht: Schlägt die Update-Prüfung fehl (404), bleibt der alte
// Worker einfach bestehen. Er muss ERSETZT werden, nicht entfernt.
//
// Also liegt hier ein Worker, der genau eine Aufgabe hat: sich selbst zu
// entfernen und die offenen Fenster neu zu laden. Beim nächsten Laden geht
// die Anfrage ans Netz, die Weiche greift.
//
// Bewusst OHNE fetch-Handler: Ein Worker ohne fetch-Handler wird bei
// Navigationen übersprungen — genau das wollen wir hier.
//
// ACHTUNG, Herkunft: github.io ist EIN Ursprung für alle Projektseiten.
// caches.keys() sieht daher auch die Caches der neuen App unter /baumeister/.
// Deshalb wird ausschließlich gelöscht, was den eigenen Geltungsbereich im
// Namen trägt (so benennt Workbox seinen Precache), und unregister() betrifft
// ohnehin nur diese eine Registrierung.

self.addEventListener('install', () => {
  // Nicht auf das Schließen der alten Fenster warten
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const namen = await caches.keys();
      await Promise.all(
        namen
          .filter((name) => name.includes(self.registration.scope))
          .map((name) => caches.delete(name))
      );
      await self.registration.unregister();
      // Offene Fenster neu laden: ohne Worker landen sie auf der Weiche.
      // f.url trägt das Fragment mit — die geteilte Challenge überlebt.
      const fenster = await self.clients.matchAll({ type: 'window' });
      for (const f of fenster) f.navigate(f.url);
    })()
  );
});
