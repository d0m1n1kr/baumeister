<script lang="ts">
  import type { Square } from '../engine/types';
  import { catalog, artFor } from '../data';
  import { CATEGORY_CSS, RESOURCE_CSS } from './helpers';

  let {
    player,
    board,
    selected = [],
    highlights = [],
    tentative = null,
    oncell
  }: {
    player: number;
    board: Square[];
    selected?: number[];
    highlights?: number[];
    /** Unbestätigt platziertes Material (noch verschiebbar). */
    tentative?: number | null;
    oncell?: (square: number) => void;
  } = $props();

  function cardOf(sq: Square) {
    return sq.building ? catalog[sq.building.card] : undefined;
  }
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
        <div class="building" style="--cat: {CATEGORY_CSS[def.color]}">
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
    </div>
  {/each}
</div>

<style>
  .board {
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
  @keyframes pulse { from { outline-color: var(--ok); } to { outline-color: transparent; } }
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
  .stockCount {
    position: absolute;
    bottom: 1px;
    right: 3px;
    font-size: 10px;
    font-weight: 700;
    color: var(--ink);
  }
</style>
