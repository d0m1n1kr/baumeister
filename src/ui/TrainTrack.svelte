<script lang="ts">
  // Eisenbahn: permanente Gleise am unteren (und oberen) Spielfeldrand mit
  // Tunnelportalen an den Enden. Der Zug ist samt Beladung immer sichtbar —
  // er parkt an der Stadt, bei der er gerade hält, und fährt beim Rundenwechsel
  // sichtbar zur nächsten (durch die Tunnel, wenn er die Seite wechselt).
  // Waggons hängen HINTER der Lok. Rein aus Zustands-Diffs abgeleitet.
  import { game } from '../store/gameStore.svelte';
  import { catalog } from '../data';
  import { trainStopPlayer } from '../engine/game';
  import { RESOURCE_CSS } from './helpers';
  import { sfx } from './sound';

  let {
    /** Einzelansicht (Gast/Handy): nur die eigene Stadt liegt an der Strecke. */
    focus = null
  }: { focus?: number | null } = $props();

  const st = $derived(game.state);

  type Spot = { edge: 'bottom' | 'top'; x: number };

  const topUsed = $derived(
    focus == null && (st?.players.some((p) => p.corner >= 2) ?? false)
  );

  /** Parkposition einer Rundkurs-Position in Bildschirmkoordinaten. */
  function slotFor(pos: number): Spot | null {
    if (!st || pos >= st.players.length) return null; // Tunnel-Segment
    if (focus != null) return pos === focus ? { edge: 'bottom', x: 50 } : null;
    const c = st.players[pos].corner;
    return (
      [
        { edge: 'bottom', x: 28 }, { edge: 'bottom', x: 72 },
        { edge: 'top', x: 72 }, { edge: 'top', x: 28 }
      ] as Spot[]
    )[c] ?? { edge: 'bottom', x: 50 };
  }

  const reduceMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fahrtrichtung ist immer „vorwärts": unten links → rechts, oben rechts → links.
  const EXIT_X = { bottom: 112, top: -12 } as const;
  const ENTRY_X = { bottom: -12, top: 112 } as const;

  let anim = $state<{ edge: 'bottom' | 'top'; x: number; dur: number; shown: boolean }>({
    edge: 'bottom', x: 50, dur: 0, shown: false
  });
  let runId = 0;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const legDur = (from: number, to: number) => Math.max(400, Math.abs(to - from) * 22);

  async function drive(from: Spot | null, to: Spot | null, horn: boolean): Promise<void> {
    const my = ++runId;
    sfx.play('trainMove');
    if (reduceMotion) {
      anim = to
        ? { edge: to.edge, x: to.x, dur: 0, shown: true }
        : { ...anim, shown: false };
      if (horn) sfx.play('trainHorn');
      return;
    }
    // 1) Direktfahrt, wenn Ziel in Fahrtrichtung auf derselben Strecke liegt
    if (from && to && from.edge === to.edge &&
        (from.edge === 'bottom' ? to.x > from.x : to.x < from.x)) {
      anim = { edge: to.edge, x: to.x, dur: legDur(from.x, to.x), shown: true };
      await sleep(anim.dur);
    } else {
      // 2) In den vorderen Tunnel ausfahren …
      if (from) {
        const exit = EXIT_X[from.edge];
        anim = { edge: from.edge, x: exit, dur: legDur(from.x, exit), shown: true };
        await sleep(anim.dur);
        if (my !== runId) return;
        anim = { ...anim, shown: false };
        await sleep(350);
      }
      if (my !== runId) return;
      // 3) … und aus dem Einfahrtstunnel der Zielstrecke wieder herein
      if (to) {
        const entry = ENTRY_X[to.edge];
        anim = { edge: to.edge, x: entry, dur: 0, shown: false };
        await sleep(30); // Teleport rendern lassen, dann sichtbar losfahren
        if (my !== runId) return;
        anim = { edge: to.edge, x: to.x, dur: legDur(entry, to.x), shown: true };
        await sleep(anim.dur);
      }
    }
    if (my !== runId) return;
    if (horn && to) sfx.play('trainHorn');
  }

  let prevPos: number | null = null;
  $effect(() => {
    const pos = st?.train?.pos ?? null;
    const prev = prevPos;
    prevPos = pos;
    if (st == null || pos == null) return;
    if (prev == null) {
      // Mount/Reload: ohne Fahrt an die aktuelle Position stellen
      const spot = slotFor(pos);
      anim = spot
        ? { edge: spot.edge, x: spot.x, dur: 0, shown: true }
        : { ...anim, shown: false };
      return;
    }
    if (pos === prev) return;
    void drive(slotFor(prev), slotFor(pos), trainStopPlayer(st, catalog) != null);
  });
</script>

<div class="layer" aria-hidden="true">
  <div class="track bottom"></div>
  {#if topUsed}<div class="track top"></div>{/if}

  {#if st?.train}
    <div
      class="train"
      class:onTop={anim.edge === 'top'}
      class:hiddenTrain={!anim.shown}
      style="left: {anim.x}%; transition-duration: {anim.dur}ms"
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

  <div class="tunnel bottom left"></div>
  <div class="tunnel bottom right"></div>
  {#if topUsed}
    <div class="tunnel top left"></div>
    <div class="tunnel top right"></div>
  {/if}
</div>

<style>
  .layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 60;
  }
  /* Gleisbett: zwei Schienen + Schwellen */
  .track {
    position: absolute;
    left: 0;
    right: 0;
    height: 10px;
    background:
      repeating-linear-gradient(90deg, #55483a 0 4px, transparent 4px 14px) center / 100% 10px,
      linear-gradient(#0000 0 2px, #8d8478 2px 3.5px, #0000 3.5px 6.5px, #8d8478 6.5px 8px, #0000 8px);
    opacity: 0.85;
  }
  .track.bottom { bottom: 2px; }
  .track.top { top: 2px; }

  .train {
    position: absolute;
    display: flex;
    align-items: flex-end;
    gap: 3px;
    translate: -50% 0;
    transition: left 0ms linear;
    z-index: 1;
  }
  .train { bottom: 9px; }
  .train.onTop { bottom: auto; top: 9px; rotate: 180deg; }
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

  /* Tunnelportale: der Zug verschwindet in ihnen (liegen über dem Zug) */
  .tunnel {
    position: absolute;
    width: 42px;
    height: 46px;
    background: #2c3a4d;
    border: 3px solid #46586f;
    z-index: 2;
  }
  .tunnel.bottom { bottom: 0; border-bottom: none; border-radius: 24px 24px 0 0; }
  .tunnel.top { top: 0; border-top: none; border-radius: 0 0 24px 24px; }
  .tunnel.left { left: -6px; }
  .tunnel.right { right: -6px; }
</style>
