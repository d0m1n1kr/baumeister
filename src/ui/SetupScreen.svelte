<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { buildGameConfig, todayId } from '../store/newGameConfig';
  import { SETS } from '../data/sets';
  import { sortPlayersClockwise } from '../engine/registry';
  import { session } from '../net/session.svelte';
  import { selectedTransport } from '../net';
  import { makeRoomCode } from '../net/protocol';
  import type { Seat } from '../net/seats';
  import { t } from '../i18n/de';
  import CreditsFooter from './CreditsFooter.svelte';
  import HelpDialog from './HelpDialog.svelte';

  let { onjoin }: { onjoin: () => void } = $props();

  const DEFAULT_CORNERS: Record<number, number[]> = {
    1: [0],
    2: [0, 2],
    3: [0, 1, 3],
    4: [0, 1, 2, 3]
  };

  let count = $state(4);
  let names = $state(['Spieler 1', 'Spieler 2', 'Spieler 3', 'Spieler 4']);
  let corners = $state([...DEFAULT_CORNERS[4]]);
  let useMonuments = $state(true);
  let cavernRule = $state(false);
  let townHall = $state(false);
  let chosenSets = $state<string[]>([]);
  let multiDevice = $state(false);
  let daily = $state(false);
  const solo = $derived(count === 1);
  let remote = $state([false, true, true, true]);
  let error = $state('');
  let busy = $state(false);
  let showHelp = $state(false);

  function toggleSet(id: string) {
    chosenSets = chosenSets.includes(id)
      ? chosenSets.filter((s) => s !== id)
      : [...chosenSets, id];
  }

  function setCount(n: number) {
    count = n;
    corners = [...DEFAULT_CORNERS[n]];
  }

  function setCorner(i: number, corner: number) {
    const other = corners.findIndex((c, j) => c === corner && j !== i);
    if (other >= 0) corners[other] = corners[i]; // Ecken tauschen
    corners[i] = corner;
  }

  function currentPlayers() {
    return Array.from({ length: count }, (_, i) => ({
      name: names[i].trim() || `Spieler ${i + 1}`,
      corner: corners[i],
      remote: multiDevice && remote[i]
    }));
  }

  function activeSets(): string[] {
    return ['base', ...chosenSets];
  }

  function start() {
    try {
      game.start(
        buildGameConfig(currentPlayers(), activeSets(), useMonuments, !solo && cavernRule, {
          solo,
          dailyId: solo && daily ? todayId() : undefined,
          townHall: !solo && townHall
        })
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Mehrgerätemodus: Raum öffnen und auf Mitspieler warten. Die Sitzplätze werden
   * schon hier in Uhrzeiger-Reihenfolge angelegt, damit ihre Indizes später exakt
   * den Spielerindizes der Partie entsprechen.
   */
  async function openRoom() {
    if (busy) return;
    const seated = sortPlayersClockwise(currentPlayers());
    if (!seated.some((p) => !p.remote)) {
      error = 'Mindestens ein Platz muss an diesem Gerät bleiben.';
      return;
    }
    const seats: Seat[] = seated.map((p, index) => ({
      index,
      name: p.remote ? '—' : p.name,
      corner: p.corner,
      kind: p.remote ? 'remote' : 'local',
      connected: !p.remote
    }));
    busy = true;
    error = '';
    try {
      session.setup = { sets: activeSets(), useMonuments, cavern: cavernRule, townHall };
      await session.openRoom(makeRoomCode(), seats, selectedTransport());
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<main>
  <h1>🏘 {t.appTitle}</h1>
  <section>
    <div class="field">
      <span class="label">{t.players}</span>
      <div class="seg">
        {#each [1, 2, 3, 4] as n}
          <button class:primary={count === n} onpointerup={() => setCount(n)}>{n}</button>
        {/each}
      </div>
    </div>

    {#if solo}
      <!-- Offizielle Solo-Variante: Material aus dem Kartendeck -->
      <div class="field modeRow">
        <span class="label">{t.soloMode}</span>
        <div class="seg">
          <button class:primary={!daily} onpointerup={() => (daily = false)}>{t.soloFree}</button>
          <button class:primary={daily} onpointerup={() => (daily = true)}>📅 {t.soloDaily}</button>
        </div>
      </div>
      <p class="modeHint">
        {#if daily}{t.soloDailyHint}{/if}
        <button class="link helpLink" onpointerup={() => (showHelp = true)}>📖 {t.helpButton}</button>
      </p>
    {/if}

    {#if !solo}
    <div class="field modeRow">
      <span class="label">{t.deviceMode}</span>
      <div class="seg">
        <button class:primary={!multiDevice} onpointerup={() => (multiDevice = false)}>
          {t.oneDevice}
        </button>
        <button class:primary={multiDevice} onpointerup={() => (multiDevice = true)}>
          {t.ownDevices}
        </button>
      </div>
    </div>
    <p class="modeHint">
      {multiDevice ? t.ownDevicesHint : t.oneDeviceHint}
      <button class="link helpLink" onpointerup={() => (showHelp = true)}>📖 {t.helpButton}</button>
    </p>
    {/if}

    {#each Array.from({ length: count }) as _, i}
      <div class="field playerRow">
        <input
          type="text"
          bind:value={names[i]}
          placeholder={`${t.playerName} ${i + 1}`}
          maxlength="14"
          disabled={multiDevice && remote[i]}
        />
        {#if !solo}
        <select
          value={corners[i]}
          onchange={(e) => setCorner(i, Number((e.currentTarget as HTMLSelectElement).value))}
        >
          {#each [0, 1, 2, 3] as c}
            <option value={c}>{t.cornerNames[c]}</option>
          {/each}
        </select>
        {/if}
        {#if multiDevice}
          <button
            class="deviceToggle"
            class:remote={remote[i]}
            onpointerup={() => (remote[i] = !remote[i])}
          >
            {remote[i] ? `📱 ${t.seatOwnDevice}` : `🏠 ${t.seatHere}`}
          </button>
        {/if}
      </div>
    {/each}

    <label class="field toggle">
      <input type="checkbox" bind:checked={useMonuments} />
      <span>{t.useMonuments}</span>
    </label>

    {#if !solo}
      <label class="field toggle">
        <input type="checkbox" bind:checked={townHall} />
        <span>🏛 {t.townHallMode}</span>
        <span class="expDesc">{t.townHallModeHint}</span>
      </label>
      <label class="field toggle">
        <input type="checkbox" bind:checked={cavernRule} />
        <span>{t.cavernRule}</span>
        <span class="expDesc">{t.cavernRuleHint}</span>
      </label>
    {/if}

    <div class="expansions">
      <span class="expTitle">{t.expansions}</span>
      {#each SETS.filter((s) => !s.core) as set}
        <label class="field toggle expRow">
          <input
            type="checkbox"
            checked={chosenSets.includes(set.id)}
            onchange={() => toggleSet(set.id)}
          />
          <span class="expName">{set.name}</span>
          <span class="expDesc">{set.description}</span>
        </label>
      {/each}
    </div>

    {#if error}<div class="error">{error}</div>{/if}
    {#if multiDevice}
      <button class="primary big" disabled={busy} onpointerup={openRoom}>{t.openRoom}</button>
    {:else}
      <button class="primary big" onpointerup={start}>{t.startGame}</button>
    {/if}
  </section>

  <button class="link" onpointerup={onjoin}>{t.joinTitle} →</button>
  <CreditsFooter />
</main>

{#if showHelp}
  <HelpDialog
    mode={solo ? 'solo' : multiDevice ? 'host' : 'single'}
    onclose={() => (showHelp = false)}
  />
{/if}

<style>
  main {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 22px;
    overflow-y: auto;
  }
  h1 { margin: 0; font-size: 34px; }
  section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--bg-panel);
    padding: 22px 26px;
    border-radius: 16px;
    width: min(420px, 90vw);
  }
  .field { display: flex; align-items: center; gap: 12px; }
  .label { flex: 1; }
  .seg { display: flex; gap: 6px; }
  .seg button { width: 46px; }
  .playerRow input {
    flex: 1;
    font: inherit;
    color: inherit;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 8px 10px;
    min-width: 0;
  }
  .playerRow select {
    font: inherit;
    color: inherit;
    background: var(--bg);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 8px;
  }
  .toggle { cursor: pointer; }
  .toggle input { width: 20px; height: 20px; flex-shrink: 0; }
  .expansions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    padding-top: 10px;
  }
  .expTitle { font-size: 13px; color: var(--text-dim); }
  .expRow { align-items: flex-start; }
  .expName { font-weight: 600; white-space: nowrap; }
  .expDesc { font-size: 11px; color: var(--text-dim); line-height: 1.35; }
  .big { font-size: 17px; padding: 12px; margin-top: 6px; }
  .error { color: var(--danger); font-size: 13px; }
  .modeRow { flex-wrap: wrap; }
  .modeRow .seg button { width: auto; font-size: 13px; }
  .modeHint { margin: -6px 0 0; font-size: 11px; color: var(--text-dim); line-height: 1.4; }
  .deviceToggle { font-size: 11px; padding: 6px 8px; white-space: nowrap; }
  .deviceToggle.remote { border-color: var(--accent); color: var(--accent); }
  .playerRow input:disabled { opacity: 0.45; }
  .link {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 14px;
    text-decoration: underline;
  }
  .helpLink { font-size: 12px; padding: 0 0 0 8px; }
</style>
