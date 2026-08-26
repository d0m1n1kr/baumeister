<script lang="ts">
  // Host-Dialog im laufenden Spiel: QR-Code des Raums plus Platzverwaltung.
  // Damit lassen sich Spieler jederzeit (wieder) auf eigene Geräte bringen —
  // ein freigegebener Platz geht an das nächste Gerät, das dem Raum beitritt.
  import { session } from '../net/session.svelte';
  import { joinUrlFor, signalingStatus } from '../net';
  import { t } from '../i18n';
  import QrCode from './QrCode.svelte';

  let { onclose }: { onclose: () => void } = $props();

  // Vermittlungs-Anzeige: zeigt dem Host sofort, ob ER das Problem ist.
  let relays = $state<{ open: number; total: number } | null>(null);
  $effect(() => {
    relays = signalingStatus();
    const timer = setInterval(() => (relays = signalingStatus()), 2000);
    return () => clearInterval(timer);
  });
</script>

<div class="scrim" role="button" tabindex="-1" onpointerup={onclose}>
  <div class="dialog" role="dialog" tabindex="-1" onpointerup={(e) => e.stopPropagation()}>
    <h3>{t.handoverTitle}</h3>

    <div class="code">
      <QrCode text={joinUrlFor(session.roomCode)} size={150} />
      <div class="codeText">
        <span class="label">{t.roomCode}</span>
        <span class="value">{session.roomCode}</span>
      </div>
    </div>
    <p class="hint">{t.handoverHint}</p>
  {#if relays}
    <p class="relayLine" class:bad={relays.open === 0}>{t.relayStatus(relays.open, relays.total)}</p>
  {/if}

    <ul class="seats">
      {#each session.seats as seat}
        <li>
          <span class="dot" class:on={seat.kind === 'local' || seat.connected}></span>
          <span class="name">{seat.name}</span>
          <span class="state">
            {#if seat.kind === 'local'}{t.seatHere}
            {:else if seat.connected}{t.connected}
            {:else if seat.clientId}{t.disconnected}
            {:else}{t.seatFree}{/if}
          </span>
          {#if seat.kind === 'local'}
            <button onpointerup={() => session.releaseSeat(seat.index)}>{t.releaseSeat}</button>
          {:else if seat.kind === 'remote' && !seat.connected}
            {#if seat.clientId}
              <button onpointerup={() => session.releaseSeat(seat.index)}>{t.releaseForNewDevice}</button>
            {/if}
            <button onpointerup={() => session.takeOverSeat(seat.index)}>{t.takeOverSeat}</button>
          {/if}
        </li>
      {/each}
    </ul>

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
    z-index: 80;
    border: none;
    padding: 12px;
  }
  .dialog {
    background: var(--bg-panel);
    border-radius: var(--r-lg);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(420px, 94vw);
    max-height: 90vh;
    overflow-y: auto;
    touch-action: pan-y;
  }
  h3 { margin: 0; font-size: var(--fs-lg); text-align: center; }
  .code { display: flex; align-items: center; gap: 14px; justify-content: center; }
  .codeText { display: flex; flex-direction: column; gap: 3px; }
  .label { font-size: var(--fs-xs); color: var(--text-dim); }
  .value { font-size: var(--fs-xl); font-weight: 800; letter-spacing: 4px; }
  .hint { margin: 0; font-size: var(--fs-sm); color: var(--text-dim); text-align: center; }
  .seats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .seats li { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); flex-wrap: wrap; }
  .seats .name { font-weight: 700; }
  .seats .state { color: var(--text-dim); margin-right: auto; }
  .seats button { font-size: var(--fs-xs); padding: 4px 8px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text-dim); flex-shrink: 0; }
  .dot.on { background: var(--ok); }
  .relayLine { margin: 0; font-size: var(--fs-xs); color: var(--text-dim); text-align: center; }
  .relayLine.bad { color: var(--danger); font-weight: 700; }
</style>
