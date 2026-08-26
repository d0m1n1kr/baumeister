<script lang="ts">
  import { cardName } from '../i18n';
  import type { CardDef } from '../engine/types';
  import { artFor } from '../data';
  import { CATEGORY_CSS, FEATURE_ICONS } from './helpers';
  import PatternGrid from './PatternGrid.svelte';

  let {
    card,
    onclick,
    badge = '',
    compact = false,
    description = ''
  }: {
    card: CardDef;
    onclick?: (e: PointerEvent) => void;
    badge?: string;
    compact?: boolean;
    /** Alice-Modus: Kartentext direkt auf der Karte anzeigen. */
    description?: string;
  } = $props();
</script>

<button
  class="mini"
  class:compact
  style="--cat: {CATEGORY_CSS[card.color]}"
  onpointerup={(e) => onclick?.(e)}
>
  <span class="bar"></span>
  <span class="name">{cardName(card)}</span>
  <span class="body">
    <span class="art">{@html artFor(card) ?? ''}</span>
    <PatternGrid pattern={card.pattern} cell={compact ? 7 : 9} />
  </span>
  <span class="feats">
    {#each card.features as f}
      <span title={FEATURE_ICONS[f]?.title}>{FEATURE_ICONS[f]?.icon}</span>
    {/each}
    {#if card.unverified}
      <span title="Kartendetails nicht verifiziert — Korrekturen siehe src/data/schema.md">⚠</span>
    {/if}
  </span>
  {#if description}<span class="desc">{description}</span>{/if}
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
    border-radius: var(--r-md);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    width: 100%;
    min-width: 0;
  }
  .bar {
    position: absolute;
    inset: 0 0 auto 0;
    height: 6px;
    border-radius: var(--r-md) 8px 0 0;
    background: var(--cat);
  }
  .name {
    font-size: var(--fs-xs);
    font-weight: 700;
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .compact .name { font-size: var(--fs-xs); }
  .compact { padding: 4px 5px 3px; gap: 2px; }
  .compact .feats { font-size: var(--fs-xs); min-height: 9px; }
  .body { display: flex; align-items: center; gap: 6px; }
  .art { width: 30px; height: 30px; display: block; }
  .compact .art { width: 24px; height: 24px; }
  .art :global(svg) { width: 100%; height: 100%; display: block; }
  .feats { display: flex; gap: 4px; font-size: var(--fs-xs); line-height: 1; min-height: 11px; }
  .desc {
    font-size: var(--fs-xs);
    line-height: 1.3;
    text-align: left;
    color: var(--paper-ink);
    opacity: 0.85;
    padding: 1px 1px 2px;
  }
  .badge {
    position: absolute;
    top: -6px;
    right: -6px;
    background: var(--accent);
    color: var(--ink);
    font-size: var(--fs-xs);
    font-weight: 700;
    border-radius: var(--r-pill);
    padding: 2px 6px;
  }
</style>
