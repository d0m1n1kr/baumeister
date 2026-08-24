<script lang="ts">
  import { session } from '../net/session.svelte';
  import { joinUrlFor, signalingStatus } from '../net';
  import { t } from '../i18n';
  import QrCode from './QrCode.svelte';

  let { onstart, oncancel }: { onstart: () => void; oncancel: () => void } = $props();

  const seats = $derived(session.seats);
  const remoteSeats = $derived(seats.filter((s) => s.kind === 'remote'));
  const allConnected = $derived(remoteSeats.every((s) => s.connected));

  // Vermittlungs-Anzeige: zeigt dem Host sofort, ob ER das Problem ist.
  let relays = $state<{ open: number; total: number } | null>(null);
  $effect(() => {
    relays = signalingStatus();
    const timer = setInterval(() => (relays = signalingStatus()), 2000);
    return () => clearInterval(timer);
  });
</script>

<main>
  <h1>{t.lobbyTitle}</h1>

  <section class="code">
    <QrCode text={joinUrlFor(session.roomCode)} size={190} />
    <div class="codeText">
      <span class="label">{t.roomCode}</span>
      <span class="value">{session.roomCode}</span>
      <span class="hint">{t.scanHint}</span>
    </div>
  </section>

  <ul class="seats">
    {#each seats as seat}
      <li>
        <span class="dot" class:on={seat.kind === 'local' || seat.connected}></span>
        <span class="name">{seat.name}</span>
        <span class="state">
          {#if seat.kind === 'local'}{t.seatHere}
          {:else if seat.connected}{t.connected}
          {:else}{t.waiting}{/if}
        </span>
        {#if seat.kind === 'remote' && !seat.connected}
          <button onpointerup={() => session.takeOverSeat(seat.index)}>{t.takeOverSeat}</button>
        {/if}
      </li>
    {/each}
  </ul>

  <p class="note">{t.hostStaysAwake}</p>
  {#if relays}
    <p class="relayLine" class:bad={relays.open === 0}>{t.relayStatus(relays.open, relays.total)}</p>
  {/if}

  <div class="actions">
    <button onpointerup={oncancel}>{t.leaveRoom}</button>
    <button class="primary" disabled={!allConnected} onpointerup={onstart}>
      {allConnected ? t.startWithConnected : t.needAllSeats}
    </button>
  </div>
</main>

<style>
  main {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 20px;
    overflow-y: auto;
    touch-action: pan-y;
  }
  h1 { margin: 0; font-size: 24px; }
  .code {
    display: flex;
    align-items: center;
    gap: 20px;
    background: var(--bg-panel);
    padding: 16px 20px;
    border-radius: 14px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .codeText { display: flex; flex-direction: column; gap: 4px; }
  .label { font-size: 12px; color: var(--text-dim); }
  .value { font-size: 34px; font-weight: 700; letter-spacing: 4px; color: var(--accent); }
  .hint { font-size: 12px; color: var(--text-dim); max-width: 220px; }
  .seats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(420px, 90vw);
  }
  .seats li {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 8px 12px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-dim);
    flex-shrink: 0;
  }
  .dot.on { background: var(--ok); }
  .name { flex: 1; font-weight: 600; }
  .state { font-size: 12px; color: var(--text-dim); }
  .seats button { font-size: 12px; padding: 4px 8px; }
  .note { margin: 0; font-size: 12px; color: var(--text-dim); text-align: center; }
  .actions { display: flex; gap: 10px; }
  .actions button { font-size: 16px; padding: 10px 18px; }
  .relayLine { margin: 0; font-size: 11px; color: var(--text-dim); text-align: center; }
  .relayLine.bad { color: var(--danger); font-weight: 700; }
</style>
