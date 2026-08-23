<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { catalog } from '../data';
  import type { CardDef } from '../engine/types';
  import { RESOURCE_CSS } from './helpers';
  import { t } from '../i18n/de';
  import CardMini from './CardMini.svelte';
  import CardOverlay from './CardOverlay.svelte';

  let { onabort }: { onabort?: () => void } = $props();

  const st = $derived(game.state!);
  const named = $derived(st.phase.t === 'round' ? st.phase.resource : null);

  let overlay = $state<{ card: CardDef; rotation: number } | null>(null);

  function open(card: CardDef, e: PointerEvent) {
    // Zum antippenden Spieler drehen: obere Hälfte = 180°
    overlay = { card, rotation: e.clientY < window.innerHeight / 2 ? 180 : 0 };
  }
</script>

<div class="strip">
  <div class="info">
    <span class="round">
      {t.round} {Math.max(1, st.round)}
      <button class="abort" onpointerup={() => onabort?.()} title={t.abortGame}>✕</button>
    </span>
    <span class="mb">👑 {st.players[st.masterBuilder].name}</span>
    {#if named}
      <span class="named">
        <span class="dot" style="background: {RESOURCE_CSS[named]}"></span>
        {t.resourceNames[named]}
      </span>
    {/if}
  </div>
  <div class="cards">
    {#each st.config.activeCards as id}
      <CardMini card={catalog[id]} onclick={(e) => open(catalog[id], e)} />
    {/each}
  </div>
</div>

{#if overlay}
  <CardOverlay card={overlay.card} rotation={overlay.rotation} onclose={() => (overlay = null)} />
{/if}

<style>
  .strip {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: rgba(0, 0, 0, 0.25);
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    padding: 8px 8px;
    overflow: hidden;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
    font-size: 11px;
    color: var(--text-dim);
    padding-bottom: 2px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .round { display: flex; align-items: center; gap: 8px; }
  .abort {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    padding: 0;
    font-size: 11px;
    opacity: 0.55;
    line-height: 1;
  }
  .mb { color: var(--accent); font-weight: 700; }
  .named { display: flex; align-items: center; gap: 5px; color: var(--text); font-weight: 600; }
  .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,0.4); }
  .cards {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    gap: 4px;
    min-height: 0;
  }
</style>
