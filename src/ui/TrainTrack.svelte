<script lang="ts">
  // Eisenbahn: EINE durchgehende Strecke je Brettreihe, exakt auf Höhe der
  // Brett-Unterkanten (aus dem echten Layout gemessen), so weit, wie die Reihe
  // Städte hat — mit Tunnelportalen an den Enden. Steht die vertikale
  // Kartenleiste im Weg, fährt der Zug hinter ihr durch einen Tunnel.
  // Der Zug (3 Waggons HINTER der Lok) ist samt Beladung immer sichtbar und
  // parkt unter der Stadt, bei der er gerade hält. Rein aus Zustands-Diffs
  // abgeleitet — identisch am Einzelgerät, beim Host und bei Gästen.
  import { game } from '../store/gameStore.svelte';
  import { catalog } from '../data';
  import { trainStopPlayer } from '../engine/game';
  import { RESOURCE_CSS } from './helpers';
  import { sfx } from './sound';

  const st = $derived(game.state);

  type Edge = 'bottom' | 'top';
  type Spot = { edge: Edge; x: number };
  /** Eine Strecke: Höhe in px, waagerechter Bereich in % der Bildschirmbreite. */
  interface Rail {
    y: number;
    from: number;
    to: number;
  }
  interface Layout {
    /** Die Strecke je Brettreihe (nur vorhandene Reihen). */
    tracks: Partial<Record<Edge, Rail>>;
    /** Parkposition je Spieler: unter der Mitte seines Bretts. */
    slots: Record<number, Spot>;
    /** Vertikale Kartenleiste: x-Bereich (%) — dort fährt der Zug durch den Tunnel. */
    strip: { l: number; r: number } | null;
  }

  // ---------- Layout aus dem DOM messen ----------
  // Bretter markieren sich per data-track={player} (nur die großen Bretter der
  // Spielerecken, keine Mini-Bretter). Gemessen wird beim Start, bei Resize,
  // vor jeder Fahrt und periodisch (Ansichtswechsel Host ↔ Einzelansicht).
  let layout = $state<Layout | null>(null);

  function measure(): void {
    if (typeof document === 'undefined') return;
    const els = document.querySelectorAll<HTMLElement>('[data-track]');
    if (els.length === 0) {
      layout = null;
      return;
    }
    const vw = window.innerWidth;
    // Vertikale Kartenleiste als Hindernis (die horizontale liegt nie im Weg).
    // Sie wird zuerst gemessen: Sie teilt den Bildschirm, und erst dadurch
    // steht fest, auf welcher Seite ein Brett liegt.
    let strip: Layout['strip'] = null;
    const stripEl = document.querySelector('.strip:not(.horizontal)');
    if (stripEl) {
      const r = stripEl.getBoundingClientRect();
      if (r.height > r.width) strip = { l: (r.left / vw) * 100, r: (r.right / vw) * 100 };
    }
    const rows: Record<Edge, { y: number[]; left: boolean; right: boolean }> = {
      bottom: { y: [], left: false, right: false },
      top: { y: [], left: false, right: false }
    };
    const slots: Record<number, Spot> = {};
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // Die Kante meldet das Brett selbst (aus seiner Rotation abgeleitet):
      // gedrehte Bretter der Gegenseite haben ihre „Unterkante" oben.
      const edge: Edge = el.dataset.trackEdge === 'top' ? 'top' : 'bottom';
      const x = ((r.left + r.width / 2) / vw) * 100;
      rows[edge].y.push(edge === 'top' ? r.top : r.bottom);
      if (!strip || x <= strip.l) rows[edge].left = true;
      if (strip && x > strip.l) rows[edge].right = true;
      slots[Number(el.dataset.track)] = { edge, x };
    }
    const tracks: Partial<Record<Edge, Rail>> = {};
    for (const edge of ['bottom', 'top'] as Edge[]) {
      const row = rows[edge];
      if (row.y.length === 0) continue;
      // Die ÄUSSERSTE Kante der Reihe, nicht der Mittelwert: Bretter einer
      // Reihe sollten gleich groß sein (panelReserve stimmt die Panelhöhe ab),
      // aber falls sie es einmal nicht sind, liegt die Strecke außen bündig am
      // größten Brett statt quer über allen.
      const y = edge === 'top' ? Math.min(...row.y) : Math.max(...row.y);
      // Nur so weit, wie die Reihe Städte hat: Am Handy im Querformat stehen
      // die zwei Bretter NEBENeinander. Eine Strecke über die ganze Breite lief
      // dort quer durch das Brett des anderen Spielers.
      const from = strip && !row.left ? strip.r : 0;
      const to = strip && !row.right ? strip.l : 100;
      tracks[edge] = { y, from, to };
    }
    layout = { tracks, slots, strip };
  }

  $effect(() => {
    measure();
    window.addEventListener('resize', measure);
    // Ansichtswechsel und Phasenwechsel (Draft → Runde) ändern das Layout
    // ohne Resize — kurz getaktet nachmessen (wenige getBoundingClientRect,
    // praktisch kostenlos)
    const timer = setInterval(measure, 500);
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(timer);
    };
  });

  function slotFor(pos: number): Spot | null {
    if (!st || pos >= st.players.length) return null; // Tunnel-Segment
    return layout?.slots[pos] ?? null; // ungemessene Stadt (z. B. Einzelansicht)
  }

  // ---------- Fahrt ----------
  const reduceMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fahrtrichtung ist immer „vorwärts": unten links → rechts, oben rechts → links.
  // Ein- und Ausfahrt liegen an den Enden der eigenen Strecke — das ist der
  // Bildschirmrand, wo sie hinreicht, sonst das Portal an der Kartenleiste.
  const exitX = (edge: Edge) => {
    const r = layout?.tracks[edge];
    if (!r) return edge === 'bottom' ? 106 : -6;
    return edge === 'bottom' ? r.to + 6 : r.from - 6;
  };
  const entryX = (edge: Edge) => {
    const r = layout?.tracks[edge];
    if (!r) return edge === 'bottom' ? -6 : 106;
    return edge === 'bottom' ? r.from - 6 : r.to + 6;
  };

  let driving = $state<{ edge: Edge; x: number; dur: number; shown: boolean } | null>(null);
  let runId = 0;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const legDur = (from: number, to: number) => Math.max(400, Math.abs(to - from) * 22);

  async function drive(from: Spot | null, to: Spot | null, horn: boolean): Promise<void> {
    const my = ++runId;
    sfx.play('trainMove');
    if (reduceMotion) {
      if (horn) sfx.play('trainHorn');
      return; // geparkte Position folgt direkt aus dem Zustand
    }
    if (from && to && from.edge === to.edge &&
        (from.edge === 'bottom' ? to.x > from.x : to.x < from.x)) {
      // Direktfahrt auf derselben Strecke
      driving = { edge: from.edge, x: from.x, dur: 0, shown: true };
      await sleep(30);
      if (my !== runId) return;
      driving = { edge: to.edge, x: to.x, dur: legDur(from.x, to.x), shown: true };
      await sleep(driving.dur);
    } else {
      // In den vorderen Tunnel ausfahren …
      if (from) {
        const exit = exitX(from.edge);
        driving = { edge: from.edge, x: from.x, dur: 0, shown: true };
        await sleep(30);
        if (my !== runId) return;
        driving = { edge: from.edge, x: exit, dur: legDur(from.x, exit), shown: true };
        await sleep(driving.dur);
        if (my !== runId) return;
        driving = { ...driving, shown: false };
        await sleep(350);
      }
      if (my !== runId) return;
      // … und aus dem Einfahrtstunnel der Zielstrecke wieder herein
      if (to) {
        const entry = entryX(to.edge);
        driving = { edge: to.edge, x: entry, dur: 0, shown: false };
        await sleep(30);
        if (my !== runId) return;
        driving = { edge: to.edge, x: to.x, dur: legDur(entry, to.x), shown: true };
        await sleep(driving.dur);
      }
    }
    if (my !== runId) return;
    if (horn && to) sfx.play('trainHorn');
    driving = null; // ab jetzt wieder an der Parkposition aus dem Zustand
  }

  let prevPos: number | null = null;
  $effect(() => {
    const pos = st?.train?.pos ?? null;
    const prev = prevPos;
    prevPos = pos;
    if (st == null || pos == null || prev == null || pos === prev) return;
    measure(); // frische Koordinaten für Start und Ziel
    void drive(slotFor(prev), slotFor(pos), trainStopPlayer(st, catalog) != null);
  });

  // Anzeigeposition: während der Fahrt animiert, sonst geparkt an der Stadt
  const spot = $derived.by(() => {
    if (driving) return driving;
    const s = st?.train ? slotFor(st.train.pos) : null;
    return s ? { ...s, dur: 0, shown: true } : null;
  });
  const trackY = $derived(spot ? layout?.tracks[spot.edge]?.y : undefined);

  const trackList = $derived(
    (['bottom', 'top'] as Edge[]).flatMap((e) => {
      const r = layout?.tracks[e];
      return r ? [{ edge: e, ...r }] : [];
    })
  );

  // Hinter der Kartenleiste (Tunnel): Der Zug verschwindet Stück für Stück im
  // Portal — per rAF wird an der echten Position ein clip-path berechnet, der
  // den Teil hinter der Leiste abschneidet.
  let trainEl = $state<HTMLElement | null>(null);
  let clip = $state('');
  $effect(() => {
    if (!driving) {
      clip = '';
      return;
    }
    let raf = 0;
    const step = () => {
      const s = layout?.strip;
      if (s && trainEl) {
        const vw = window.innerWidth;
        const sl = (s.l / 100) * vw;
        const sr = (s.r / 100) * vw;
        const r = trainEl.getBoundingClientRect();
        // clip-path wirkt VOR der Rotation: Auf der oberen Strecke (180°
        // gedreht) sind lokale und Bildschirm-Seiten vertauscht.
        const flip = driving?.edge === 'top';
        if (r.left >= sl && r.right <= sr) {
          clip = 'inset(0 100% 0 0)'; // komplett im Tunnel
        } else if (r.right > sl && r.left < sl) {
          const cut = r.right - sl; // rechter Teil steckt im Tunnel
          clip = flip ? `inset(0 0 0 ${cut}px)` : `inset(0 ${cut}px 0 0)`;
        } else if (r.left < sr && r.right > sr) {
          const cut = sr - r.left; // linker Teil steckt noch im Tunnel
          clip = flip ? `inset(0 ${cut}px 0 0)` : `inset(0 0 0 ${cut}px)`;
        } else {
          clip = '';
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="layer" aria-hidden="true">
  {#each trackList as tr (tr.edge)}
    {#if layout?.strip && tr.from < layout.strip.l && tr.to > layout.strip.r}
      {@const strip = layout.strip}
      <!-- Städte auf beiden Seiten: Die Gleise enden an den Tunnelportalen der
           Kartenleiste — dahinter verläuft die Strecke unsichtbar „durch den
           Berg" -->
      <div class="track" style="top: {tr.y - 5}px; left: 0; width: {strip.l}%"></div>
      <div class="track" style="top: {tr.y - 5}px; left: {strip.r}%; right: 0"></div>
      <div class="portal" style="left: calc({strip.l}% - 12px); top: {tr.y - 17}px"></div>
      <div class="portal" style="left: calc({strip.r}% - 2px); top: {tr.y - 17}px"></div>
    {:else}
      <div
        class="track"
        style="top: {tr.y - 5}px; left: {tr.from}%; width: {tr.to - tr.from}%"
      ></div>
      {#if layout?.strip && tr.to <= layout.strip.l}
        <div class="portal" style="left: calc({tr.to}% - 12px); top: {tr.y - 17}px"></div>
      {/if}
      {#if layout?.strip && tr.from >= layout.strip.r}
        <div class="portal" style="left: calc({tr.from}% - 2px); top: {tr.y - 17}px"></div>
      {/if}
    {/if}
    <!-- Tunnel nur da, wo die Strecke den Bildschirmrand erreicht -->
    {#if tr.from <= 0}
      <div class="tunnel left" class:up={tr.edge === 'top'} style="top: {tr.y - 20}px"></div>
    {/if}
    {#if tr.to >= 100}
      <div class="tunnel right" class:up={tr.edge === 'top'} style="top: {tr.y - 20}px"></div>
    {/if}
  {/each}

  {#if st?.train && spot && trackY != null}
    <div
      class="train"
      class:onTop={spot.edge === 'top'}
      class:hiddenTrain={!spot.shown}
      style="left: {spot.x}%; top: {trackY}px; transition-duration: {spot.dur}ms; {clip ? `clip-path: ${clip};` : ''}"
      bind:this={trainEl}
    >
      <!-- Waggons hängen hinter der Lok (Fahrtrichtung: Lok vorn rechts) -->
      {#each [...st.train.wagons].reverse() as w}
        <span class="car">
          {#if w}<span class="load" style="background: {RESOURCE_CSS[w]}"></span>{/if}
        </span>
      {/each}
      <span class="loco">🚂</span>
    </div>
  {/if}
</div>

<style>
  .layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 60;
  }
  /* Gleisbett: zwei Schienen + Schwellen, exakt an der Brett-Unterkante */
  .track {
    position: absolute;
    height: 10px;
    background:
      repeating-linear-gradient(90deg, #55483a 0 4px, transparent 4px 14px) center / 100% 10px,
      linear-gradient(#0000 0 2px, #8d8478 2px 3.5px, #0000 3.5px 6.5px, #8d8478 6.5px 8px, #0000 8px);
    opacity: 0.8;
  }

  .train {
    position: absolute;
    display: flex;
    align-items: flex-end;
    gap: 3px;
    /* Ankerpunkt: Räder auf der Gleislinie (inline top = Brettkante) */
    translate: -50% calc(-100% + 9px);
    transition: left 0ms linear;
    z-index: 1;
  }
  /* Obere Bretter: Zug um 180° gedreht (für die Gegenseite aufrecht) — die
     Räder liegen nach der Drehung an der Box-Oberkante, also Box an die Linie */
  .train.onTop { rotate: 180deg; translate: -50% -9px; }
  .hiddenTrain { visibility: hidden; }
  .loco { font-size: var(--fs-2xl); line-height: 1; transform: scaleX(-1); }
  .car {
    width: 24px;
    height: 16px;
    border-radius: var(--r-sm) 4px 2px 2px;
    background: #6b4a35;
    border: 2px solid #3b3327;
    display: grid;
    place-items: center;
    margin-bottom: 1px;
  }
  .load {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 1.5px solid rgba(0, 0, 0, 0.4);
  }

  /* Tunnelportale an den Bildschirmrändern (liegen über dem Zug) */
  .tunnel {
    position: absolute;
    width: 40px;
    height: 40px;
    background: #2c3a4d;
    border: 3px solid #46586f;
    border-radius: var(--r-pill) 22px 6px 6px;
    z-index: 2;
  }
  .tunnel.up { border-radius: var(--r-sm) 6px 22px 22px; }
  .tunnel.left { left: -8px; }
  .tunnel.right { right: -8px; }

  /* Tunnelportale an der Kartenleiste (schmale Torbögen) */
  .portal {
    position: absolute;
    width: 14px;
    height: 34px;
    background: #2c3a4d;
    border: 3px solid #46586f;
    border-radius: var(--r-md) 10px 4px 4px;
    z-index: 2;
  }

  /* ---------- Theme: Mars-Kolonie — Verbindungsrohr statt Gleis ---------- */
  /* Glasrohr mit Ringsegmenten */
  :global([data-theme='mars']) .track {
    background:
      repeating-linear-gradient(90deg, #6f8fae 0 3px, transparent 3px 26px) center / 100% 10px,
      linear-gradient(#7ea4c4 0 2px, rgba(168, 203, 232, 0.35) 2px 8px, #7ea4c4 8px 10px);
    border-radius: var(--r-sm);
    opacity: 0.9;
  }
  /* Transportkapsel statt Lok: gezeichnet, kein Emoji */
  :global([data-theme='mars']) .loco {
    font-size: 0;
    width: 30px;
    height: 17px;
    margin-bottom: 1px;
    background: linear-gradient(#eef3f8, #9fb0c1);
    border: 2px solid #3b3327;
    border-radius: var(--r-sm) 12px 12px 4px;
    position: relative;
  }
  :global([data-theme='mars']) .loco::after {
    content: '';
    position: absolute;
    right: 5px;
    top: 4px;
    width: 7px;
    height: 5px;
    border-radius: var(--r-sm);
    background: #35608c;
  }
  /* Frachtpods: durchsichtig, die Ladung schwebt sichtbar darin */
  :global([data-theme='mars']) .car {
    background: rgba(168, 203, 232, 0.28);
    border-color: #6f8fae;
    border-radius: var(--r-md);
  }
  /* Schleusen statt Tunnelportale */
  :global([data-theme='mars']) .tunnel,
  :global([data-theme='mars']) .portal {
    background: #4a3227;
    border-color: #8a5a3e;
  }

  /* ---------- Theme: Drachenreich — Flugroute statt Gleis ---------- */
  /* Flugpfad: gestrichelte Spur statt Schienen */
  :global([data-theme='fantasy']) .track {
    background: none;
    border-top: 2px dashed rgba(232, 198, 91, 0.55);
    height: 2px;
    opacity: 0.9;
  }
  /* Drachenkopf/-hals statt Lok (gezeichnet, damit die Richtung stimmt) */
  :global([data-theme='fantasy']) .loco {
    font-size: 0;
    width: 30px;
    height: 20px;
    margin-bottom: 0;
    position: relative;
    background: linear-gradient(#7e9d55, #4c6b34);
    border: 2px solid #2f2418;
    border-radius: var(--r-lg) 6px 10px 4px;
  }
  /* Schnauze + Auge + Flügel */
  :global([data-theme='fantasy']) .loco::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 3px;
    width: 12px;
    height: 9px;
    background: #7e9d55;
    border: 2px solid #2f2418;
    border-radius: var(--r-sm) 2px 2px 6px;
  }
  :global([data-theme='fantasy']) .loco::after {
    content: '';
    position: absolute;
    right: 6px;
    top: -9px;
    width: 16px;
    height: 12px;
    background: #8e6bc4;
    border: 2px solid #2f2418;
    border-radius: var(--r-md) 10px 2px 2px;
  }
  /* Traglasten: Netze unter dem Drachen */
  :global([data-theme='fantasy']) .car {
    background: rgba(163, 112, 63, 0.5);
    border-color: #6b4a2f;
    border-radius: var(--r-sm) 3px 9px 9px;
  }
  /* Wolkenbänke statt Tunnelportale */
  :global([data-theme='fantasy']) .tunnel,
  :global([data-theme='fantasy']) .portal {
    background: #4b4270;
    border-color: #6f639b;
    border-radius: var(--r-pill) 999px 40% 40%;
  }
</style>
