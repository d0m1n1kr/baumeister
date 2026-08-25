<script lang="ts">
  import { session } from '../net/session.svelte';
  import { keepScreenAwake } from './wakeLock';
  import { t } from '../i18n';
  import { game } from '../store/gameStore.svelte';
  import GameTable from './GameTable.svelte';
  import SoloView from './SoloView.svelte';
  import HandoverDialog from './HandoverDialog.svelte';
  import TrainTrack from './TrainTrack.svelte';
  import LearnBubble from './LearnBubble.svelte';
  import { learn } from './learn.svelte';

  // Gäste sehen immer ihr eigenes Brett; der Host kann zwischen Spieltisch
  // (alle Bretter, wie im Ein-Gerät-Modus) und eigener Ansicht umschalten.
  const isHost = $derived(session.role === 'host');
  let soloView = $state(false);
  let handover = $state(false);
  const hasLocalSeat = $derived(session.seats.some((s) => s.kind === 'local'));
  const useSolo = $derived(session.role === 'guest' || (isHost && soloView && hasLocalSeat));

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

{#if game.state?.train}
  <TrainTrack />
{/if}

<!-- Lernmodus: die Blase liegt über beiden Ansichten und richtet sich am
     Spielbereich aus (siehe data-learn="play" in PlayerCorner). -->
{#if learn.step}
  {@const step = learn.step}
  <LearnBubble {step} ondismiss={() => learn.dismiss(step)} onoff={() => learn.set(false)} />
{/if}

{#if isHost}
  {#if hasLocalSeat}
    <button class="viewToggle" onpointerup={() => (soloView = !soloView)}>
      {soloView ? `▦ ${t.tableView}` : `👤 ${t.myBoard}`}
    </button>
  {/if}
  <button class="qrToggle" onpointerup={() => (handover = true)} title={t.handoverTitle}>
    ⌗ {t.roomCode}
  </button>
{/if}

{#if handover}
  <HandoverDialog onclose={() => (handover = false)} />
{/if}

<style>
  .viewToggle,
  .qrToggle {
    position: fixed;
    top: calc(6px + env(safe-area-inset-top, 0px));
    right: calc(6px + env(safe-area-inset-right, 0px));
    font-size: 11px;
    padding: 5px 9px;
    opacity: 0.7;
    z-index: 60;
  }
  .qrToggle { top: calc(40px + env(safe-area-inset-top, 0px)); }
</style>
