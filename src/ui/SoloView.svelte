<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { session } from '../net/session.svelte';
  import { drags } from '../store/dragStore.svelte';
  import { RESOURCE_CSS } from './helpers';
  import { t } from '../i18n';
  import PlayerCorner from './PlayerCorner.svelte';
  import MiniBoard from './MiniBoard.svelte';
  import CardStrip from './CardStrip.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  const st = $derived(game.state!);
  /** Eigener Platz: beim Gast der zugewiesene, beim Host sein erster lokaler. */
  const me = $derived(
    session.mySeat ?? st.players.findIndex((_, i) => session.controls(i))
  );
  const others = $derived(st.players.map((_, i) => i).filter((i) => i !== me));
  /** Eigenes Monument mit in die offene Kartenleiste — hier schaut niemand mit. */
  const myMonument = $derived(st.players[me]?.monument?.card);

  let confirmLeave = $state(false);
</script>

<div class="solo">
  <div class="opponents">
    {#each others as i}
      <div class="slot"><MiniBoard player={i} /></div>
    {/each}
  </div>

  <div class="strip">
    <CardStrip
      horizontal
      solo
      extraCards={myMonument ? [myMonument] : []}
      onabort={() => (confirmLeave = true)}
    />
  </div>

  <div class="own">
    <PlayerCorner player={me} wide solo />
  </div>

  {#if session.status === 'connecting'}
    <div class="banner">{t.reconnecting}</div>
  {/if}

  {#each Object.values(drags) as d}
    {#if d}
      <div class="ghost" style="left: {d.x}px; top: {d.y}px; background: {RESOURCE_CSS[d.resource]}"></div>
    {/if}
  {/each}
</div>

{#if confirmLeave}
  <ConfirmDialog
    title={t.confirmAbort}
    confirmLabel={t.leaveRoom}
    danger
    onconfirm={() => { confirmLeave = false; session.leave(); game.reset(); }}
    oncancel={() => (confirmLeave = false)}
  />
{/if}

<style>
  .solo {
    height: 100%;
    display: grid;
    grid-template-rows: auto auto 1fr;
    overflow: hidden;
    position: relative;
  }
  .opponents {
    display: flex;
    gap: 10px;
    padding: 8px 10px 4px;
    overflow-x: auto;
    touch-action: pan-x;
    min-width: 0;
  }
  .slot { width: clamp(84px, 22vw, 130px); flex-shrink: 0; }
  @media (max-width: 720px) {
    /* Gegner-Bretter kompakter — sie sind reine Übersicht */
    .opponents { gap: 8px; padding: 6px 8px 2px; }
    .slot { width: clamp(58px, 16vw, 84px); }
  }
  .strip { min-width: 0; min-height: 0; }
  .own {
    min-height: 0;
    /* Scrollbar statt abgeschnitten: Die Knöpfe unter dem Brett müssen
       auch auf kleinen Bildschirmen immer erreichbar sein */
    overflow-y: auto;
    touch-action: pan-y;
  }
  @media (max-width: 720px) {
    /* Luft für Gleis + Zug an der Brett-Unterkante */
    .own { padding-bottom: 26px; }
  }
  .banner {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--danger);
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 999px;
    z-index: 50;
  }
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
