<script lang="ts">
  import type { CardDef } from '../engine/types';
  import { artFor } from '../data';
  import { CATEGORY_CSS, FEATURE_ICONS } from './helpers';
  import PatternGrid from './PatternGrid.svelte';

  let {
    card,
    onclick,
    badge = '',
    compact = false
  }: { card: CardDef; onclick?: (e: PointerEvent) => void; badge?: string; compact?: boolean } =
    $props();
</script>

<button
  class="mini"
  class:compact
  style="--cat: {CATEGORY_CSS[card.color]}"
  onpointerup={(e) => onclick?.(e)}
>
  <span class="bar"></span>
  <span class="name">{card.name.de}</span>
  <span class="body">
    <span class="art">{@html artFor(card) ?? ''}</span>
    <PatternGrid pattern={card.pattern} cell={compact ? 7 : 9} />
  </span>
  <span class="feats">
    {#each card.features as f}
      <span title={FEATURE_ICONS[f]?.title}>{FEATURE_ICONS[f]?.icon}</span>
    {/each}
  </span>
  {#if badge}<span class="badge">{badge}</span>{/if}
</button>

<style>
  .mini {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 5px 6px 4px;
    background: var(--bg-card);
    color: var(--paper-ink);
    border: none;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    width: 100%;
    min-width: 0;
  }
  .bar {
    position: absolute;
    inset: 0 0 auto 0;
    height: 6px;
    border-radius: 8px 8px 0 0;
    background: var(--cat);
  }
  .name {
    font-size: 11px;
    font-weight: 700;
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .compact .name { font-size: 10px; }
  .body { display: flex; align-items: center; gap: 6px; }
  .art { width: 30px; height: 30px; display: block; }
  .compact .art { width: 24px; height: 24px; }
  .art :global(svg) { width: 100%; height: 100%; display: block; }
  .feats { display: flex; gap: 4px; font-size: 10px; line-height: 1; min-height: 11px; }
  .badge {
    position: absolute;
    top: -6px;
    right: -6px;
    background: var(--accent);
    color: var(--ink);
    font-size: 10px;
    font-weight: 700;
    border-radius: 999px;
    padding: 2px 6px;
  }
</style>
