<script lang="ts">
  import type { Square } from '../engine/types';
  import { catalog, artFor } from '../data';
  import { CATEGORY_CSS, RESOURCE_CSS } from './helpers';

  /** Fliegendes Material beim Bauen (rein dekorativ). */
  type Ghost = { id: number; col: number; row: number; dx: number; dy: number; color: string };

  let {
    player,
    board,
    selected = [],
    highlights = [],
    tentative = null,
    seed = null,
    rail = false,
    oncell
  }: {
    player: number;
    board: Square[];
    selected?: number[];
    highlights?: number[];
    /** Unbestätigt platziertes Material (noch verschiebbar). */
    tentative?: number | null;
    /** Tiny Trees: Feld mit Samen. */
    seed?: number | null;
    /** Eisenbahn: Gleis-Markierung an der Unterkante (dort darf der Bahnhof hin). */
    rail?: boolean;
    oncell?: (square: number) => void;
  } = $props();

  function cardOf(sq: Square) {
    return sq.building ? catalog[sq.building.card] : undefined;
  }

  // Bau-Moment: rein aus Brett-Änderungen abgeleitet (kein Engine-Ereignis
  // nötig) — funktioniert damit identisch am Einzelgerät, beim Host und bei
  // Gästen, die nur Zustands-Snapshots empfangen. Beim ersten Rendern (Mount,
  // Reload) gibt es kein Vorher-Brett, also auch keine Animation.
  const reduceMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let prevBoard: { card: string | null; resource: string | null }[] | null = null;
  let fresh = $state<Record<number, 'build' | 'monument'>>({});
  let ghosts = $state<Ghost[]>([]);
  let ghostSeq = 0;
  let fxTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const snap = board.map((sq) => ({
      card: sq.building?.card ?? null,
      resource: sq.resource ?? null
    }));
    const prev = prevBoard;
    prevBoard = snap;
    if (!prev || reduceMotion) return;

    const builtAt: number[] = [];
    for (let i = 0; i < snap.length; i++) {
      if (snap[i].card && !prev[i]?.card) builtAt.push(i);
    }
    if (builtAt.length === 0) return;

    const marks: Record<number, 'build' | 'monument'> = {};
    for (const i of builtAt) {
      marks[i] = catalog[snap[i].card!]?.kind === 'monument' ? 'monument' : 'build';
    }
    fresh = marks;

    // Verbrauchte Materialien fliegen sichtbar zum (ersten) neuen Gebäude
    const target = builtAt[0];
    const spawned: Ghost[] = [];
    for (let i = 0; i < snap.length; i++) {
      const lost = prev[i]?.resource;
      if (lost && !snap[i].resource && !builtAt.includes(i)) {
        spawned.push({
          id: ghostSeq++,
          col: i % 4,
          row: Math.floor(i / 4),
          dx: (target % 4 - i % 4) * 100,
          dy: (Math.floor(target / 4) - Math.floor(i / 4)) * 100,
          color: RESOURCE_CSS[lost as keyof typeof RESOURCE_CSS]
        });
      }
    }
    ghosts = spawned;
    clearTimeout(fxTimer);
    fxTimer = setTimeout(() => {
      fresh = {};
      ghosts = [];
    }, 900);
  });
</script>

<div class="board">
  {#each board as sq, i}
    {@const def = cardOf(sq)}
    <div
      class="cell"
      class:selected={selected.includes(i)}
      class:highlight={highlights.includes(i)}
      class:tentative={tentative === i}
      data-player={player}
      data-square={i}
      role="button"
      tabindex="-1"
      onpointerup={() => oncell?.(i)}
    >
      {#if def}
        <div
          class="building"
          class:justBuilt={fresh[i] !== undefined}
          class:gold={fresh[i] === 'monument'}
          style="--cat: {CATEGORY_CSS[def.color]}"
        >
          <span class="bart">{@html artFor(def) ?? ''}</span>
          {#if sq.building?.marked}
            <span class="dot marked" style="background: {RESOURCE_CSS[sq.building.marked]}"></span>
          {/if}
          {#if sq.building?.stored?.length}
            <span class="stored">
              {#each sq.building.stored as r}
                <span class="dot" style="background: {RESOURCE_CSS[r]}"></span>
              {/each}
            </span>
          {/if}
          {#if sq.building?.stock?.length}
            <span class="stockCount">{sq.building.stock.length}</span>
          {/if}
          {#if sq.resource}
            <span class="dot bond" style="background: {RESOURCE_CSS[sq.resource]}"></span>
          {/if}
        </div>
      {:else if sq.resource}
        <span class="res" style="background: {RESOURCE_CSS[sq.resource]}"></span>
      {/if}
      {#if sq.coin}<span class="coinMark">🪙</span>{/if}
      {#if seed === i && !sq.building}<span class="seedMark">🌱</span>{/if}
    </div>
  {/each}
  {#if rail}<div class="railEdge"></div>{/if}
  {#each ghosts as g (g.id)}
    <span
      class="ghost"
      style="left: {g.col * 25}%; top: {g.row * 25}%; --dx: {g.dx}%; --dy: {g.dy}%"
    >
      <span class="ghostDot" style="background: {g.color}"></span>
    </span>
  {/each}
</div>

<style>
  .board {
    position: relative; /* Bezugsrahmen für die fliegenden Material-Geister */
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(4, 1fr);
    gap: 4px;
    background: #33445a;
    border: 3px solid #46586f;
    border-radius: 10px;
    padding: 5px;
    width: 100%;
    aspect-ratio: 1;
    touch-action: none;
  }
  .cell {
    position: relative;
    background: #d8cdb4;
    border-radius: 5px;
    display: grid;
    place-items: center;
    overflow: visible;
  }
  .cell.selected { outline: 3px solid var(--accent); outline-offset: -1px; z-index: 1; }
  .cell.tentative { outline: 3px dashed var(--accent); outline-offset: -1px; z-index: 1; }
  .cell.highlight {
    outline: 3px dashed var(--ok);
    outline-offset: -1px;
    z-index: 1;
    animation: pulse 1s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    from { outline-color: var(--ok); box-shadow: inset 0 0 10px 1px color-mix(in srgb, var(--ok) 45%, transparent); }
    to { outline-color: transparent; box-shadow: inset 0 0 2px 0 transparent; }
  }

  /* Bau-Moment: Gebäude ploppt auf (scale als Einzel-Property, kollidiert
     nicht mit anderen Transforms), Monumente glühen zusätzlich golden */
  .building.justBuilt {
    animation: buildPop 380ms cubic-bezier(0.34, 1.56, 0.64, 1) 110ms backwards;
    z-index: 2;
  }
  .building.justBuilt.gold {
    animation:
      buildPop 380ms cubic-bezier(0.34, 1.56, 0.64, 1) 110ms backwards,
      monumentGlow 1.3s ease-out 110ms backwards;
  }
  @keyframes buildPop { from { scale: 0.2; opacity: 0; } }
  @keyframes monumentGlow {
    0% { box-shadow: 0 0 0 0 rgba(255, 205, 90, 0.95); }
    100% { box-shadow: 0 0 20px 8px rgba(255, 205, 90, 0); }
  }

  /* Fliegende Material-Geister: verbrauchte Materialien ziehen sich zum
     neuen Gebäude zusammen. translate in % der eigenen (Zellen-)Größe =
     exakte Zellenkoordinaten. */
  .ghost {
    position: absolute;
    width: 25%;
    height: 25%;
    display: grid;
    place-items: center;
    pointer-events: none;
    z-index: 3;
    animation: ghostFly 330ms ease-in forwards;
  }
  .ghostDot {
    width: 46%;
    height: 46%;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.35);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  @keyframes ghostFly {
    to { translate: var(--dx) var(--dy); scale: 0.3; opacity: 0.1; }
  }
  /* Eisenbahn: Gleis an der Unterkante — an dieser Reihe liegt die Strecke */
  .railEdge {
    position: absolute;
    left: 8%;
    right: 8%;
    bottom: -1px;
    height: 7px;
    pointer-events: none;
    background:
      repeating-linear-gradient(90deg, #55483a 0 3px, transparent 3px 11px) center / 100% 7px,
      linear-gradient(#0000 0 1px, #8d8478 1px 2.5px, #0000 2.5px 4.5px, #8d8478 4.5px 6px, #0000 6px);
    opacity: 0.9;
  }

  @media (prefers-reduced-motion: reduce) {
    .ghost { display: none; }
    .building.justBuilt, .building.justBuilt.gold { animation: none; }
    .cell.highlight { animation: none; }
  }
  .building {
    position: absolute;
    inset: 0;
    border-radius: 5px;
    background: color-mix(in srgb, var(--cat) 34%, #f2ead8);
    border-bottom: 4px solid var(--cat);
    display: grid;
    place-items: center;
  }
  .bart { width: 78%; height: 78%; }
  .bart :global(svg) { width: 100%; height: 100%; }
  .res {
    width: 46%;
    height: 46%;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.35);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid rgba(0, 0, 0, 0.4);
    display: inline-block;
  }
  .marked { position: absolute; top: 2px; right: 2px; }
  .bond { position: absolute; top: 2px; left: 2px; }
  .stored { position: absolute; bottom: 2px; left: 2px; display: flex; gap: 2px; }
  .coinMark { position: absolute; top: 1px; right: 2px; font-size: 12px; }
  .seedMark { position: absolute; bottom: 1px; left: 2px; font-size: 12px; }
  .stockCount {
    position: absolute;
    bottom: 1px;
    right: 3px;
    font-size: 10px;
    font-weight: 700;
    color: var(--ink);
  }
</style>
