<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { buildGameConfig } from '../store/newGameConfig';
  import { session } from '../net/session.svelte';
  import { clearJoinHash, joinCodeFromUrl, selectedTransport } from '../net';
  import { clearSession, loadSession, restoreSeats } from '../net/sessionPersist';
  import { t } from '../i18n/de';
  import SetupScreen from './SetupScreen.svelte';
  import JoinScreen from './JoinScreen.svelte';
  import HostLobby from './HostLobby.svelte';
  import GameView from './GameView.svelte';
  import ScoreScreen from './ScoreScreen.svelte';
  import UpdateBanner from './UpdateBanner.svelte';
  import CreditsFooter from './CreditsFooter.svelte';

  let showResume = $state(game.hasSave());
  let urlJoin = $state(joinCodeFromUrl());
  let joining = $state(joinCodeFromUrl() !== null);
  let setupError = $state('');

  // Unterbrochene Mehrgeräte-Sitzung (Reload, iOS-Tab-Rauswurf) wieder aufnehmen.
  // Ein Code in der Adresszeile ist dabei der stärkste Wunsch: Wer einen QR-Code
  // scannt, will in DIESEN Raum — nicht zurück in eine alte gemerkte Sitzung.
  const stored = loadSession();
  // Bewusst der Anfangswert (Startlogik läuft genau einmal beim Laden).
  // svelte-ignore state_referenced_locally
  const initialUrlJoin = joinCodeFromUrl();
  if (initialUrlJoin && stored && stored.code !== initialUrlJoin) {
    if (stored.role === 'guest' && stored.name) {
      // Name ist bekannt: direkt in den neuen Raum
      void session.join(initialUrlJoin, stored.name, selectedTransport());
    }
    joining = true;
  } else if (stored?.role === 'guest' && stored.name) {
    // Gast: nahtlos zurück in die Partie — der Host erkennt uns an der clientId.
    joining = true;
    void session.join(stored.code, stored.name, selectedTransport());
  } else if (stored?.role === 'host' && !game.hasSave()) {
    // Host-Reload noch in der Lobby: Raum mit denselben Plätzen wieder öffnen.
    if (stored.setup) session.setup = stored.setup;
    void session.openRoom(stored.code, restoreSeats(stored.seats ?? []), selectedTransport())
      .catch((e) => (setupError = e instanceof Error ? e.message : String(e)));
  }

  // iOS öffnet den QR-Link gern im BEREITS offenen Tab: Dann gibt es keinen
  // Reload, nur ein hashchange (bzw. pageshow aus dem bfcache) — darauf muss
  // die laufende App genauso reagieren wie auf einen frischen Start.
  $effect(() => {
    const onHash = () => {
      const code = joinCodeFromUrl();
      if (!code || code === session.roomCode) return; // kein/derselbe Raum
      if (session.role !== 'off') session.leave();
      urlJoin = code;
      joining = true;
      showResume = false;
      if (stored?.role === 'guest' && stored.name) {
        void session.join(code, stored.name, selectedTransport());
      }
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('pageshow', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('pageshow', onHash);
    };
  });

  // Nach längerem Hintergrund (iOS-Schlaf) den Raum komplett neu aufbauen:
  // Die Vermittlungs-Relays vergessen ihre Abos beim Socket-Abriss, und ohne
  // Neuaufbau würde das Gerät zwar weiter senden, aber nichts mehr hören.
  $effect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > 10000) {
        hiddenAt = 0;
        void session.reconnectTransport();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });

  // Nach gelungenem (Auto-)Beitritt den Code aus der Adresszeile räumen.
  $effect(() => {
    if (session.role === 'guest' && session.status !== 'connecting') clearJoinHash();
  });

  /** „Weiterspielen": Spielstand laden und — falls Host einer Sitzung — den Raum
   *  wieder öffnen; die Gäste verbinden sich dann von selbst neu. */
  async function resumeGame() {
    if (!game.resume()) {
      showResume = false;
      return;
    }
    if (stored?.role === 'host') {
      if (stored.setup) session.setup = stored.setup;
      try {
        await session.openRoom(stored.code, restoreSeats(stored.seats ?? []), selectedTransport());
        session.status = 'playing';
        session.broadcastState();
      } catch (e) {
        // Ohne Netz läuft die Partie lokal weiter (alle Plätze bedienbar).
        setupError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  /** Host startet aus der Lobby: Konfiguration aus den aktuellen Sitzplätzen bauen. */
  function startFromLobby() {
    const players = session.seats.map((s) => ({ name: s.name, corner: s.corner }));
    const { sets, useMonuments, cavern } = session.setup;
    try {
      session.startGame(buildGameConfig(players, sets, useMonuments, cavern));
    } catch (e) {
      setupError = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<UpdateBanner />

{#if session.role === 'guest'}
  {#if session.status === 'playing' && game.state}
    {#if game.state.phase.t === 'gameOver'}
      <ScoreScreen />
    {:else}
      <GameView />
    {/if}
  {:else}
    {#key urlJoin}
      <JoinScreen initialCode={urlJoin ?? stored?.code} initialName={stored?.name} onback={() => (joining = false)} />
    {/key}
  {/if}
{:else if session.role === 'host' && !game.state}
  <HostLobby onstart={startFromLobby} oncancel={() => session.leave()} />
  {#if setupError}<div class="fatal">{setupError}</div>{/if}
{:else if game.state}
  {#if game.state.phase.t === 'gameOver'}
    <ScoreScreen />
  {:else}
    <GameView />
  {/if}
{:else if joining}
  {#key urlJoin}
    <JoinScreen initialCode={urlJoin ?? stored?.code} initialName={stored?.name} onback={() => (joining = false)} />
  {/key}
{:else if showResume}
  <main class="resume">
    <h1>🏘 {t.appTitle}</h1>
    <div class="buttons">
      <button class="primary big" onpointerup={resumeGame}>
        {t.resumeGame}
      </button>
      <button class="big" onpointerup={() => { game.reset(); clearSession(); showResume = false; }}>{t.newGame}</button>
    </div>
    <CreditsFooter />
  </main>
{:else}
  <SetupScreen onjoin={() => (joining = true)} />
{/if}

<style>
  .resume {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 26px;
  }
  h1 { margin: 0; font-size: 34px; }
  .buttons { display: flex; flex-direction: column; gap: 12px; width: 240px; }
  .big { font-size: 17px; padding: 12px; }
  .fatal {
    position: fixed;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--danger);
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
  }
</style>
