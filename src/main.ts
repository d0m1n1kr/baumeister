import { mount } from 'svelte';
import './app.css';
import App from './ui/App.svelte';
import { syncAppHeight } from './ui/viewport';

// Höhe der Hülle prüfen, bevor die App zeichnet (installierte iOS-PWA meldet
// sie zu klein — Details in viewport.ts)
syncAppHeight();

const app = mount(App, { target: document.getElementById('app')! });

// Lade-Splash (index.html) ausblenden — aber erst, wenn die Animation einmal
// durchgelaufen ist: Mit gefülltem Offline-Cache steht die App nach ~100 ms,
// und die Felder (Verzögerungen bis 0,9 s) wären sonst nie zu sehen.
const splash = document.getElementById('splash');
if (splash) {
  const MIN_SPLASH_MS = 1700;
  const wait = Math.max(0, MIN_SPLASH_MS - performance.now());
  setTimeout(() => {
    splash.classList.add('done');
    setTimeout(() => splash.remove(), 500);
  }, wait);
}

export default app;
