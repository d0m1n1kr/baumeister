<script lang="ts">
  import { session } from '../net/session.svelte';
  import { selectedTransport, joinCodeFromUrl, clearJoinHash } from '../net';
  import { isValidRoomCode, normalizeRoomCode } from '../net/protocol';
  import { t } from '../i18n/de';

  let {
    onback,
    initialCode,
    initialName
  }: { onback: () => void; initialCode?: string; initialName?: string } = $props();

  // Bewusst nur der Anfangswert: eine Vorbelegung, die der Nutzer frei editiert.
  // svelte-ignore state_referenced_locally
  let code = $state(joinCodeFromUrl() ?? initialCode ?? '');
  // svelte-ignore state_referenced_locally
  let name = $state(initialName ?? '');
  let busy = $state(false);

  const ready = $derived(isValidRoomCode(normalizeRoomCode(code)) && name.trim().length > 0);
  const seats = $derived(session.lobbySeats);

  async function join() {
    if (!ready || busy) return;
    busy = true;
    session.clearError();
    try {
      await session.join(normalizeRoomCode(code), name.trim(), selectedTransport());
      clearJoinHash();
    } catch {
      // Die Sitzung räumt selbst auf und stellt die Meldung in netError bereit.
    } finally {
      busy = false;
    }
  }

  function leave() {
    session.leave();
    clearJoinHash();
    onback();
  }
</script>

<main>
  <h1>🏘 {t.joinTitle}</h1>

  {#if session.role === 'guest' && session.status !== 'error'}
    <section class="status">
      {#if session.status === 'connecting'}
        <p>{t.connecting}</p>
      {:else}
        <p>{t.waitingForHost}</p>
        <ul class="seats">
          {#each seats as seat}
            <li class:me={seat.index === session.mySeat}>
              <span class="dot" class:on={seat.connected}></span>
              <span>{seat.name}</span>
            </li>
          {/each}
        </ul>
      {/if}
      <button onpointerup={leave}>{t.leaveRoom}</button>
    </section>
  {:else}
    <section class="form">
      <label>
        <span>{t.joinCode}</span>
        <input
          class="codeInput"
          type="text"
          autocapitalize="characters"
          autocomplete="off"
          maxlength="7"
          bind:value={code}
          placeholder="ABC234"
        />
      </label>
      <label>
        <span>{t.yourName}</span>
        <input type="text" maxlength="14" bind:value={name} placeholder="Name" />
      </label>

      {#if session.netError}<div class="error">{session.netError}</div>{/if}

      <div class="actions">
        <button onpointerup={leave}>{t.cancel}</button>
        <button class="primary" disabled={!ready || busy} onpointerup={join}>
          {busy ? t.connecting : t.joinButton}
        </button>
      </div>
    </section>
  {/if}
</main>

<style>
  main {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 20px;
  }
  h1 { margin: 0; font-size: 26px; }
  .form, .status {
    background: var(--bg-panel);
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: min(360px, 90vw);
  }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
  input {
    font: inherit;
    color: inherit;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 10px;
  }
  .codeInput {
    text-transform: uppercase;
    letter-spacing: 6px;
    font-size: 22px;
    text-align: center;
  }
  .seats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .seats li { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .seats li.me { color: var(--accent); font-weight: 700; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text-dim); }
  .dot.on { background: var(--ok); }
  .status p { margin: 0; color: var(--text-dim); text-align: center; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; }
  .error { background: var(--danger); color: #fff; font-size: 13px; padding: 8px 10px; border-radius: 8px; }
</style>
