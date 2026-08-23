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
  const twoPlayer = $derived(st.players.length === 2);
  const single = $derived(st.players.length === 1);
  let confirmAbort = $state(false);
</script>

<div class="table" class:two={twoPlayer} class:single>
  {#each st.players as p, i}
    <div class="slot" style="grid-area: {single ? 'bottom' : twoPlayer ? (p.corner >= 2 ? 'top' : 'bottom') : cornerArea(p.corner)}">
      <PlayerCorner player={i} wide={twoPlayer || single} solo={single} />
    </div>
  {/each}
  <div class="center">
    <CardStrip horizontal={twoPlayer || single} solo={single} onabort={() => (confirmAbort = true)} />
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
  /* 2 Spieler: gegenüber, Kartenleiste horizontal dazwischen */
  .table.two {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 1fr auto 1fr;
    grid-template-areas:
      'top'
      'strip'
      'bottom';
  }
  /* Solo: Kartenleiste oben, das eigene Brett darunter */
  .table.single {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'strip'
      'bottom';
  }
  @media (max-width: 700px) {
    /* 3–4 Spieler: schmalere Mittelspalte. Gilt NICHT für das
       Ein-Spalten-Layout des Solo-Modus. */
    .table:not(.two):not(.single) {
      grid-template-columns: 1fr clamp(92px, 24vw, 120px) 1fr;
    }
  }
  .slot { min-width: 0; min-height: 0; overflow: hidden; }
  .center { grid-area: strip; position: relative; min-height: 0; min-width: 0; }
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
