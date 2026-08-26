<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { buildGameConfig } from '../store/newGameConfig';
  import { session } from '../net/session.svelte';
  import { clearJoinHash, joinCodeFromUrl, selectedTransport } from '../net';
  import { clearSession, loadSession, restoreSeats } from '../net/sessionPersist';
  import { t } from '../i18n';
  import SetupScreen from './SetupScreen.svelte';
  import JoinScreen from './JoinScreen.svelte';
  import HostLobby from './HostLobby.svelte';
  import GameView from './GameView.svelte';
  import ScoreScreen from './ScoreScreen.svelte';
  import UpdateBanner from './UpdateBanner.svelte';
  import CreditsFooter from './CreditsFooter.svelte';
  import { sfx } from './sound';
  import { dailyIdFromHash } from './share';
  import type { GameState } from '../engine/types';

  let showResume = $state(game.hasSave());
  let urlJoin = $state(joinCodeFromUrl());
  let joining = $state(joinCodeFromUrl() !== null);
  let setupError = $state('');
  // Geteilter Tages-Challenge-Link: Der Startbildschirm wählt dann genau
  // diesen Tag vor, damit beide Seiten dieselbe Auslage spielen.
  let urlDaily = $state(dailyIdFromHash(location.hash));

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
      urlDaily = dailyIdFromHash(location.hash) ?? urlDaily;
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

  // Soundeffekte zentral aus Zustandsänderungen ableiten — funktioniert damit
  // identisch am Einzelgerät, beim Host und bei Gästen (Zustand vom Netz).
  let prevState: GameState | null = null;
  $effect(() => {
    const st = game.state;
    const prev = prevState;
    prevState = st;
    if (!st || !prev || st === prev) return;

    if (st.phase.t === 'round' && prev.phase.t !== 'round') {
      sfx.play('named');
    } else if (st.phase.t === 'nameResource' && prev.phase.t === 'round') {
      // Neue Runde: Hinweiston, wenn der neue Baumeister an diesem Gerät sitzt
      if (session.controls(st.masterBuilder)) sfx.play('myTurn');
    } else if (st.phase.t === 'gameOver' && prev.phase.t !== 'gameOver') {
      sfx.play('gameOver');
    }

    let built = false;
    let monument = false;
    let placed = false;
    let coined = false;
    let seeded = false;
    for (const [i, pl] of st.players.entries()) {
      const old = prev.players[i];
      if (!old) continue;
      const buildings = pl.board.filter((sq) => sq.building).length;
      const oldBuildings = old.board.filter((sq) => sq.building).length;
      if (buildings > oldBuildings) {
        built = true;
        if (pl.monument?.built && !old.monument?.built) monument = true;
      }
      const res = pl.board.filter((sq) => sq.resource).length;
      if (res > old.board.filter((sq) => sq.resource).length) placed = true;
      if (pl.coins > old.coins) coined = true;
      if (pl.seedSquare === -1 && (old.seedSquare ?? -1) >= 0) seeded = true;
    }
    if (monument) sfx.play('monument');
    else if (built) sfx.play('build');
    else if (placed) sfx.play('place', (st.phase.t === 'round' ? st.phase.resource : undefined) ?? undefined);
    if (coined && !monument) sfx.play('coin');
    if (seeded) sfx.play('tree');
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
    const { sets, useMonuments, cavern, townHall, train } = session.setup;
    try {
      session.startGame(buildGameConfig(players, sets, useMonuments, cavern, { townHall, train }));
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
  <SetupScreen onjoin={() => (joining = true)} initialDaily={urlDaily} />
{/if}

<style>
  .resume {
    height: 100%;
    padding-bottom: var(--safe-bottom);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 26px;
  }
  h1 { margin: 0; font-size: var(--fs-2xl); }
  .buttons { display: flex; flex-direction: column; gap: 12px; width: 240px; }
  .big { font-size: var(--fs-lg); padding: 12px; }
  .fatal {
    position: fixed;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--danger);
    padding: 8px 14px;
    border-radius: var(--r-md);
    font-size: var(--fs-sm);
  }
</style>
