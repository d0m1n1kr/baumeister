<script lang="ts">
  // Eisenbahn: EINE durchgehende Strecke je Brettreihe, exakt auf Höhe der
  // Brett-Unterkanten (aus dem echten Layout gemessen), vom linken bis zum
  // rechten Bildschirmrand — mit Tunnelportalen an den Enden. Steht die
  // vertikale Kartenleiste im Weg, fährt der Zug hinter ihr durch einen Tunnel.
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
  interface Layout {
    /** y-Position (px) der Strecke je Brettreihe (nur vorhandene Reihen). */
    tracks: Partial<Record<Edge, number>>;
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
    const vh = window.innerHeight;
    const rows: Record<Edge, number[]> = { bottom: [], top: [] };
    const slots: Record<number, Spot> = {};
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // Obere Bretter sind zur Gegenseite gedreht — ihre „Unterkante" liegt
      // in Bildschirmkoordinaten oben.
      const edge: Edge = r.top + r.height / 2 < vh / 2 ? 'top' : 'bottom';
      rows[edge].push(edge === 'top' ? r.top : r.bottom);
      slots[Number(el.dataset.track)] = { edge, x: ((r.left + r.width / 2) / vw) * 100 };
    }
    const tracks: Partial<Record<Edge, number>> = {};
    for (const edge of ['bottom', 'top'] as Edge[]) {
      if (rows[edge].length) {
        tracks[edge] = rows[edge].reduce((a, b) => a + b, 0) / rows[edge].length;
      }
    }
    // Vertikale Kartenleiste als Hindernis (die horizontale liegt nie im Weg)
    let strip: Layout['strip'] = null;
    const stripEl = document.querySelector('.strip:not(.horizontal)');
    if (stripEl) {
      const r = stripEl.getBoundingClientRect();
      if (r.height > r.width) strip = { l: (r.left / vw) * 100, r: (r.right / vw) * 100 };
    }
    layout = { tracks, slots, strip };
  }

  $effect(() => {
    measure();
    window.addEventListener('resize', measure);
    // Ansichtswechsel (Tisch ↔ Einzelansicht) ändern das Layout ohne Resize
    const timer = setInterval(measure, 2000);
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
  const EXIT_X = { bottom: 106, top: -6 } as const;
  const ENTRY_X = { bottom: -6, top: 106 } as const;

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
        const exit = EXIT_X[from.edge];
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
        const entry = ENTRY_X[to.edge];
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
  const trackY = $derived(spot ? layout?.tracks[spot.edge] : undefined);

  const trackList = $derived(
    (['bottom', 'top'] as Edge[]).flatMap((e) => {
      const y = layout?.tracks[e];
      return y != null ? [{ edge: e, y }] : [];
    })
  );

  // Hinter der Kartenleiste (Tunnel): Zug während der Fahrt ausblenden,
  // solange er den Leisten-Bereich kreuzt — per rAF an der echten Position.
  let trainEl = $state<HTMLElement | null>(null);
  let inStrip = $state(false);
  $effect(() => {
    if (!driving) {
      inStrip = false;
      return;
    }
    let raf = 0;
    const step = () => {
      const s = layout?.strip;
      if (s && trainEl) {
        const r = trainEl.getBoundingClientRect();
        const cx = (((r.left + r.right) / 2) / window.innerWidth) * 100;
        inStrip = cx > s.l - 1.5 && cx < s.r + 1.5;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="layer" aria-hidden="true">
  {#each trackList as tr (tr.edge)}
    <div class="track" style="top: {tr.y - 5}px"></div>
    <div class="tunnel left" class:up={tr.edge === 'top'} style="top: {tr.y - 20}px"></div>
    <div class="tunnel right" class:up={tr.edge === 'top'} style="top: {tr.y - 20}px"></div>
    {#if layout?.strip}
      {@const strip = layout.strip}
      <!-- Tunnelportale an der Kartenleiste: der Zug fährt hinter ihr durch -->
      <div class="portal" style="left: calc({strip.l}% - 7px); top: {tr.y - 17}px"></div>
      <div class="portal" style="left: calc({strip.r}% - 7px); top: {tr.y - 17}px"></div>
    {/if}
  {/each}

  {#if st?.train && spot && trackY != null}
    <div
      class="train"
      class:onTop={spot.edge === 'top'}
      class:hiddenTrain={!spot.shown || inStrip}
      style="left: {spot.x}%; top: {trackY}px; transition-duration: {spot.dur}ms"
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
    left: 0;
    right: 0;
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
  .loco { font-size: 30px; line-height: 1; transform: scaleX(-1); }
  .car {
    width: 24px;
    height: 16px;
    border-radius: 4px 4px 2px 2px;
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
    border-radius: 22px 22px 6px 6px;
    z-index: 2;
  }
  .tunnel.up { border-radius: 6px 6px 22px 22px; }
  .tunnel.left { left: -8px; }
  .tunnel.right { right: -8px; }

  /* Tunnelportale an der Kartenleiste (schmale Torbögen) */
  .portal {
    position: absolute;
    width: 14px;
    height: 34px;
    background: #2c3a4d;
    border: 3px solid #46586f;
    border-radius: 10px 10px 4px 4px;
    z-index: 2;
  }
</style>
