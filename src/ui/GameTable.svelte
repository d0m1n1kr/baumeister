<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { drags } from '../store/dragStore.svelte';
  import { cornerArea } from './helpers';
  import { RESOURCE_CSS } from './helpers';
  import { t } from '../i18n/de';
  import PlayerCorner from './PlayerCorner.svelte';
  import CardStrip from './CardStrip.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  const st = $derived(game.state!);
  let confirmAbort = $state(false);
</script>

<div class="table">
  {#each st.players as p, i}
    <div class="slot" style="grid-area: {cornerArea(p.corner)}">
      <PlayerCorner player={i} />
    </div>
  {/each}
  <div class="center">
    <CardStrip onabort={() => (confirmAbort = true)} />
  </div>

  <!-- Geist-Chips für laufende Drags (unrotierte Tisch-Ebene) -->
  {#each Object.values(drags) as d}
    {#if d}
      <div class="ghost" style="left: {d.x}px; top: {d.y}px; background: {RESOURCE_CSS[d.resource]}"></div>
    {/if}
  {/each}
</div>

{#if confirmAbort}
  <ConfirmDialog
    title={t.confirmAbort}
    confirmLabel={t.abortGame}
    danger
    onconfirm={() => { confirmAbort = false; game.reset(); }}
    oncancel={() => (confirmAbort = false)}
  />
{/if}

<style>
  .table {
    height: 100%;
    display: grid;
    grid-template-columns: 1fr clamp(130px, 15vw, 180px) 1fr;
    grid-template-rows: 1fr 1fr;
    grid-template-areas:
      'tl strip tr'
      'bl strip br';
    position: relative;
    overflow: hidden;
  }
  .slot { min-width: 0; min-height: 0; overflow: hidden; }
  .center { grid-area: strip; position: relative; min-height: 0; }
  .ghost {
    position: fixed;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 3px solid #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 90;
  }
</style>
