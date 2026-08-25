<script lang="ts">
  // Messanzeige für die Höhen-Frage in der installierten PWA. Bewusst
  // schmucklos und nur über einen langen Druck auf die Rundenanzeige
  // erreichbar: Sie soll die Zahlen liefern, die man aus Screenshots nur
  // rekonstruieren kann — Viewport, gemeldete Insets und die Unterkanten der
  // Layout-Kästen. Fliegt wieder raus, sobald die Ursache feststeht.
  let { onclose }: { onclose: () => void } = $props();

  let lines = $state<string[]>([]);

  function read() {
    const cs = getComputedStyle(document.documentElement);
    const num = (v: string) => Math.round(parseFloat(v) || 0);
    const rect = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return `${sel}: —`;
      const r = el.getBoundingClientRect();
      return `${sel} ${Math.round(r.top)}–${Math.round(r.bottom)} (h ${Math.round(r.height)})`;
    };
    const vv = window.visualViewport;
    const out = [
      `screen ${screen.width}×${screen.height} dpr ${window.devicePixelRatio}`,
      `inner ${innerWidth}×${innerHeight} client ${document.documentElement.clientHeight}`,
      vv ? `visual ${Math.round(vv.width)}×${Math.round(vv.height)} offTop ${Math.round(vv.offsetTop)} pageTop ${Math.round(vv.pageTop)}` : 'visual —',
      `inset roh oben ${num(cs.getPropertyValue('--safe-raw-top'))} unten ${num(cs.getPropertyValue('--safe-raw-bottom'))}`,
      `inset genutzt unten ${num(cs.getPropertyValue('--safe-bottom'))}`,
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
</div>

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
</style>
