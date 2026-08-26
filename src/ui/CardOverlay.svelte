<script lang="ts">
  import { cardName, cardText } from '../i18n';
  import type { CardDef } from '../engine/types';
  import { artFor } from '../data';
  import { CATEGORY_CSS, FEATURE_ICONS } from './helpers';
  import PatternGrid from './PatternGrid.svelte';
  import { t } from '../i18n';

  let {
    card,
    rotation = 0,
    onclose
  }: { card: CardDef; rotation?: number; onclose: () => void } = $props();

  // Zusätzliche Drehung per Flip-Knopf, damit auch das Gegenüber lesen kann
  let flip = $state(0);
</script>

<div class="scrim" role="button" tabindex="-1" onpointerup={onclose}>
  <div
    class="big"
    style="transform: rotate({rotation + flip}deg); --cat: {CATEGORY_CSS[card.color]}"
    role="dialog"
    onpointerup={(e) => e.stopPropagation()}
  >
    <div class="bar"></div>
    <button class="flip" title="Zum Gegenüber drehen" onpointerup={() => (flip += 180)}>⟳</button>
    <h2>{cardName(card)}</h2>
    <div class="row">
      <span class="art">{@html artFor(card) ?? ''}</span>
      <PatternGrid pattern={card.pattern} cell={22} />
    </div>
    <p>{cardText(card)}</p>
    <div class="feats">
      {#each card.features as f}
        <span>{FEATURE_ICONS[f]?.icon} {FEATURE_ICONS[f]?.title}</span>
      {/each}
    </div>
    <button class="primary" onpointerup={onclose}>{t.close}</button>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    z-index: 100;
  }
  .big {
    position: relative;
    background: var(--bg-card);
    color: var(--paper-ink);
    border-radius: var(--r-lg);
    padding: 22px 26px 18px;
    width: min(420px, 80vw);
    max-height: 85vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
  }
  .bar {
    position: absolute;
    inset: 0 0 auto 0;
    height: 12px;
    border-radius: var(--r-lg) 16px 0 0;
    background: var(--cat);
  }
  .big { transition: transform 0.25s ease; }
  .flip {
    position: absolute;
    top: 18px;
    right: 14px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    padding: 0;
    font-size: var(--fs-lg);
    background: rgba(0, 0, 0, 0.08);
    color: var(--paper-ink);
    border: 1px solid rgba(0, 0, 0, 0.2);
  }
  h2 { margin: 6px 0 0; font-size: var(--fs-xl); }
  .row { display: flex; align-items: center; gap: 22px; }
  .art { width: 84px; height: 84px; }
  .art :global(svg) { width: 100%; height: 100%; }
  p { margin: 0; font-size: var(--fs-md); line-height: 1.45; text-align: center; }
  .feats { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: var(--fs-sm); opacity: 0.85; justify-content: center; }
</style>
