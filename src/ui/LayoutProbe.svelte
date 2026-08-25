<script lang="ts">
  // Messanzeige für die Höhen-Frage in der installierten PWA. Bewusst
  // schmucklos und nur über einen langen Druck auf die Rundenanzeige
  // erreichbar: Sie soll die Zahlen liefern, die man aus Screenshots nur
  // rekonstruieren kann — Viewport, gemeldete Insets und die Unterkanten der
  // Layout-Kästen. Fliegt wieder raus, sobald die Ursache feststeht.
  import { probeHeight, viewportFacts } from './viewport';

  let { onclose }: { onclose: () => void } = $props();

  let lines = $state<string[]>([]);

  function read() {
    const num = (v: string) => Math.round(parseFloat(v) || 0);
    const rect = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return `${sel}: —`;
      const r = el.getBoundingClientRect();
      return `${sel} ${Math.round(r.top)}–${Math.round(r.bottom)} (h ${Math.round(r.height)})`;
    };
    const out = [
      // Custom Properties mit env() lassen sich nur über eine Messung lesen
      ...viewportFacts(),
      rect('#app'),
      rect('.table'),
      rect('.solo'),
      rect('.strip'),
      rect('.boardWrap'),
      rect('.panel'),
      `standalone ${(navigator as { standalone?: boolean }).standalone ?? '?'} · display-mode ${
        matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'
      }`
    ];
    // Polster der Hülle und des Spieltischs mitlesen — dort steckte der Fehler
    for (const sel of ['#app', '.table', '.solo']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const s = getComputedStyle(el);
      out.push(`${sel} pad ${num(s.paddingTop)}/${num(s.paddingBottom)} pos ${s.position} h ${s.height}`);
    }
    lines = out;
  }

  // Der eigentliche Versuch: Wird UNTERHALB des Layout-Viewports gezeichnet?
  // Solange die Messanzeige offen ist, dürfen html/body die volle Web-View-Höhe
  // nutzen; darin liegt ein cyan gestreifter Balken genau in der Zone
  // zwischen innerHeight und 100vh. Ist er am Gerät zu sehen, lässt sich der
  // Streifen zurückholen — sonst gehört er der Plattform.
  $effect(() => {
    const inner = Math.round(window.innerHeight);
    const large = probeHeight('100vh');
    if (large <= inner + 1) return;
    document.documentElement.classList.add('probeBand');
    const band = document.createElement('div');
    band.className = 'probeBandMark';
    band.style.top = `${inner}px`;
    band.style.height = `${large - inner}px`;
    band.textContent = `sichtbar? ${inner}–${large}`;
    document.body.appendChild(band);
    return () => {
      document.documentElement.classList.remove('probeBand');
      band.remove();
    };
  });

  $effect(() => {
    read();
    const again = () => read();
    window.addEventListener('resize', again);
    window.visualViewport?.addEventListener('resize', again);
    const timer = setInterval(again, 1000);
    return () => {
      window.removeEventListener('resize', again);
      window.visualViewport?.removeEventListener('resize', again);
      clearInterval(timer);
    };
  });
</script>

<div class="probe">
  <button onpointerup={onclose}>✕ schließen</button>
  {#each lines as line}<span>{line}</span>{/each}
  <span class="hint">Der magenta Balken ist die Unterkante des Viewports.</span>
</div>

<!-- Sichtbare Marke: Wo endet der Bereich, den die Plattform überhaupt
     zeichnet? Alles darunter ist am Gerät nicht zu sehen. -->
<div class="edge"></div>

<style>
  .probe {
    position: fixed;
    left: 4px;
    right: 4px;
    top: calc(4px + env(safe-area-inset-top, 0px));
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: rgba(0, 0, 0, 0.88);
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: 6px 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    line-height: 1.25;
    color: #fff;
  }
  .probe button { align-self: flex-end; font-size: 10px; padding: 2px 6px; }
  .probe .hint { color: #ff7bf0; }
  .edge {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4px;
    background: #ff2bd1;
    z-index: 201;
    pointer-events: none;
  }
</style>
