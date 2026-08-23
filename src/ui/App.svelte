<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { buildGameConfig } from '../store/newGameConfig';
  import { session } from '../net/session.svelte';
  import { joinCodeFromUrl } from '../net';
  import { t } from '../i18n/de';
  import SetupScreen from './SetupScreen.svelte';
  import JoinScreen from './JoinScreen.svelte';
  import HostLobby from './HostLobby.svelte';
  import GameView from './GameView.svelte';
  import ScoreScreen from './ScoreScreen.svelte';
  import UpdateBanner from './UpdateBanner.svelte';
  import CreditsFooter from './CreditsFooter.svelte';

  let showResume = $state(game.hasSave());
  let joining = $state(joinCodeFromUrl() !== null);
  let setupError = $state('');

  /** Host startet aus der Lobby: Konfiguration aus den aktuellen Sitzplätzen bauen. */
  function startFromLobby() {
    const players = session.seats.map((s) => ({ name: s.name, corner: s.corner }));
    const { sets, useMonuments } = session.setup;
    try {
      session.startGame(buildGameConfig(players, sets, useMonuments));
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
    <JoinScreen onback={() => (joining = false)} />
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
  <JoinScreen onback={() => (joining = false)} />
{:else if showResume}
  <main class="resume">
    <h1>🏘 {t.appTitle}</h1>
    <div class="buttons">
      <button class="primary big" onpointerup={() => { if (!game.resume()) showResume = false; }}>
        {t.resumeGame}
      </button>
      <button class="big" onpointerup={() => { game.reset(); showResume = false; }}>{t.newGame}</button>
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
