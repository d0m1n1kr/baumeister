<script lang="ts">
  import { session } from '../net/session.svelte';
  import { codeFromScan, selectedTransport, joinCodeFromUrl, clearJoinHash, signalingStatus } from '../net';
  import { isValidRoomCode, normalizeRoomCode } from '../net/protocol';
  import { t, translateError } from '../i18n';
  import LanguagePicker from './LanguagePicker.svelte';
  import ThemePicker from './ThemePicker.svelte';
  import HelpDialog from './HelpDialog.svelte';
  import QrScanner from './QrScanner.svelte';

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
  let showHelp = $state(false);
  let scanning = $state(false);
  let scanError = $state('');
  const canScan = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  function scanned(text: string): boolean {
    const found = codeFromScan(text);
    if (!found) {
      scanError = t.scanInvalid;
      return false; // weiterscannen — vielleicht war ein fremder QR im Bild
    }
    scanning = false;
    scanError = '';
    code = found;
    if (name.trim()) void join(); // Name schon da: direkt beitreten
    return true;
  }

  // Diagnose beim Verbinden: Sind die Vermittlungs-Relays überhaupt erreichbar?
  let relays = $state<{ open: number; total: number } | null>(null);
  $effect(() => {
    if (session.status !== 'connecting') {
      relays = null;
      return;
    }
    const timer = setInterval(() => (relays = signalingStatus()), 1000);
    return () => clearInterval(timer);
  });

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
  <!-- Kopfzeile bleibt oben stehen, wie im Startbildschirm — vorher wanderte
       sie mit dem zentrierten Inhalt in die Bildmitte. -->
  <div class="langRow"><ThemePicker /><LanguagePicker /></div>

  <div class="scroll">
    <h1>🏘 {t.joinTitle}</h1>

    {#if session.role === 'guest' && session.status !== 'error'}
      <section class="status">
        {#if session.status === 'connecting'}
          <p>{t.connecting}</p>
          {#if relays}
            <p class="relays" class:bad={relays.open === 0}>
              {t.relayStatus(relays.open, relays.total)}
            </p>
          {/if}
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
          <div class="codeRow">
            <input
              class="codeInput"
              type="text"
              autocapitalize="characters"
              autocomplete="off"
              maxlength="7"
              bind:value={code}
              placeholder="ABC234"
            />
            {#if canScan}
              <button class="scanBtn" title={t.scanButton} onpointerup={() => { scanError = ''; scanning = true; }}>
                📷
              </button>
            {/if}
          </div>
        </label>
        <label>
          <span>{t.yourName}</span>
          <input type="text" maxlength="14" bind:value={name} placeholder={t.yourName} />
        </label>

        {#if scanError && !scanning}<div class="error">{scanError}</div>{/if}
        {#if session.netError}<div class="error">{translateError(session.netError)}</div>{/if}

        <div class="actions">
          <button onpointerup={leave}>{t.cancel}</button>
          <button class="primary" disabled={!ready || busy} onpointerup={join}>
            {busy ? t.connecting : t.joinButton}
          </button>
        </div>
        <button class="link tapArea" onpointerup={() => (showHelp = true)}>📖 {t.helpButton}</button>
      </section>
    {/if}
  </div>
</main>

{#if showHelp}
  <HelpDialog mode="guest" onclose={() => (showHelp = false)} />
{/if}

{#if scanning}
  <QrScanner onresult={scanned} onclose={() => (scanning = false)} />
{/if}

<style>
  main {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .langRow {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 12px 0;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Auto-Margins statt justify-content:center — zusammen mit Scrollen
       würde überlaufender Inhalt sonst oben abgeschnitten (Handy quer) */
    gap: 20px;
    padding: 20px;
    padding-bottom: calc(20px + var(--safe-bottom));
    overflow-y: auto;
    touch-action: pan-y;
  }
  .scroll > :first-child { margin-top: auto; }
  .scroll > :last-child { margin-bottom: auto; }
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
  .codeRow { display: flex; gap: 8px; align-items: stretch; }
  .codeInput {
    flex: 1;
    min-width: 0;
    text-transform: uppercase;
    letter-spacing: 6px;
    font-size: 22px;
    text-align: center;
  }
  .scanBtn { font-size: 20px; padding: 0 14px; }
  .seats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .seats li { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .seats li.me { color: var(--accent); font-weight: 700; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text-dim); }
  .dot.on { background: var(--ok); }
  .status p { margin: 0; color: var(--text-dim); text-align: center; }
  .relays { font-size: 11px; }
  .relays.bad { color: var(--danger); }
  .actions { display: flex; justify-content: flex-end; gap: 10px; }
  .error { background: var(--danger); color: #fff; font-size: 13px; padding: 8px 10px; border-radius: 8px; }
</style>
