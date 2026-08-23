<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { session } from '../net/session.svelte';
  import { t } from '../i18n/de';
  import BoardGrid from './BoardGrid.svelte';

  let { player }: { player: number } = $props();

  const st = $derived(game.state!);
  const p = $derived(st.players[player]);
  const isMB = $derived(st.masterBuilder === player);
  const seat = $derived(session.lobbySeats.find((s) => s.index === player));
  const offline = $derived(seat ? !seat.connected : false);
  const canTakeOver = $derived(
    session.role === 'host' &&
    session.seats[player]?.kind === 'remote' &&
    !session.seats[player]?.connected
  );
</script>

<div class="mini" class:offline>
  <header>
    <span class="dot" class:off={offline}></span>
    <span class="name">{isMB ? '👑 ' : ''}{p.name}</span>
    {#if st.config.systems.coins}<span class="coins">🪙 {p.coins}</span>{/if}
  </header>
  <BoardGrid player={player} board={p.board} />
  <footer>
    {#if p.done}{t.townComplete}
    {:else if offline}{t.disconnected}
    {:else if p.pending != null}…
    {:else if p.roundDone}✓
    {:else}&nbsp;{/if}
  </footer>
  {#if canTakeOver}
    <button class="takeover" onpointerup={() => session.takeOverSeat(player)}>
      {t.takeOverSeat}
    </button>
  {/if}
</div>

<style>
  .mini {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    min-width: 0;
    pointer-events: none; /* fremde Bretter sind reine Anzeige */
  }
  .mini.offline { opacity: 0.5; }
  .takeover {
    pointer-events: auto; /* Ausnahme vom nicht-interaktiven Brett */
    font-size: 10px;
    padding: 4px 6px;
  }
  header { display: flex; align-items: center; gap: 5px; font-size: 11px; min-width: 0; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); flex-shrink: 0; }
  .dot.off { background: var(--text-dim); }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .coins { margin-left: auto; color: var(--accent); }
  footer { font-size: 10px; color: var(--text-dim); min-height: 12px; text-align: center; }
</style>
