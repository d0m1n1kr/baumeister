<script lang="ts">
  import { session } from '../net/session.svelte';
  import { keepScreenAwake } from './wakeLock';
  import { t } from '../i18n/de';
  import GameTable from './GameTable.svelte';
  import SoloView from './SoloView.svelte';

  // Gäste sehen immer ihr eigenes Brett; der Host kann zwischen Spieltisch
  // (alle Bretter, wie im Ein-Gerät-Modus) und eigener Ansicht umschalten.
  const isHost = $derived(session.role === 'host');
  let soloView = $state(false);
  const useSolo = $derived(session.role === 'guest' || (isHost && soloView));

  // Displaysperre verhindern, solange gespielt wird (nützt auch am Einzelgerät).
  $effect(() => keepScreenAwake());

  // Im Mehrgerätemodus: nach jeder Rückkehr in den Vordergrund abgleichen.
  $effect(() => {
    if (session.role === 'off') return;
    const resume = () => {
      if (document.visibilityState === 'visible') session.onResume();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('focus', resume);
    const stopHeartbeat = session.startHeartbeat();
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('focus', resume);
      stopHeartbeat();
    };
  });
</script>

{#if useSolo}
  <SoloView />
{:else}
  <GameTable />
{/if}

{#if isHost}
  <button class="viewToggle" onpointerup={() => (soloView = !soloView)}>
    {soloView ? `▦ ${t.tableView}` : `👤 ${t.myBoard}`}
  </button>
{/if}

<style>
  .viewToggle {
    position: fixed;
    top: calc(6px + env(safe-area-inset-top, 0px));
    right: calc(6px + env(safe-area-inset-right, 0px));
    font-size: 11px;
    padding: 5px 9px;
    opacity: 0.7;
    z-index: 60;
  }
</style>
