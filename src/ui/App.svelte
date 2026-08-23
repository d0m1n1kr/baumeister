<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { t } from '../i18n/de';
  import SetupScreen from './SetupScreen.svelte';
  import GameTable from './GameTable.svelte';
  import ScoreScreen from './ScoreScreen.svelte';
  import UpdateBanner from './UpdateBanner.svelte';

  let showResume = $state(game.hasSave());
</script>

<UpdateBanner />

{#if game.state}
  {#if game.state.phase.t === 'gameOver'}
    <ScoreScreen />
  {:else}
    <GameTable />
  {/if}
{:else if showResume}
  <main class="resume">
    <h1>🏘 {t.appTitle}</h1>
    <div class="buttons">
      <button class="primary big" onpointerup={() => { if (!game.resume()) showResume = false; }}>
        {t.resumeGame}
      </button>
      <button class="big" onpointerup={() => { game.reset(); showResume = false; }}>{t.newGame}</button>
    </div>
  </main>
{:else}
  <SetupScreen />
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
</style>
