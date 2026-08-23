<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { catalog } from '../data';
  import { mulberry32, randomSeed, randomSetup } from '../engine/registry';
  import { t } from '../i18n/de';

  const DEFAULT_CORNERS: Record<number, number[]> = {
    2: [0, 2],
    3: [0, 1, 3],
    4: [0, 1, 2, 3]
  };

  let count = $state(4);
  let names = $state(['Spieler 1', 'Spieler 2', 'Spieler 3', 'Spieler 4']);
  let corners = $state([...DEFAULT_CORNERS[4]]);
  let useMonuments = $state(true);
  let error = $state('');

  function setCount(n: number) {
    count = n;
    corners = [...DEFAULT_CORNERS[n]];
  }

  function setCorner(i: number, corner: number) {
    const other = corners.findIndex((c, j) => c === corner && j !== i);
    if (other >= 0) corners[other] = corners[i]; // Ecken tauschen
    corners[i] = corner;
  }

  function start() {
    const players = Array.from({ length: count }, (_, i) => ({
      name: names[i].trim() || `Spieler ${i + 1}`,
      corner: corners[i]
    }));
    try {
      game.start(randomSetup(catalog, players, useMonuments, mulberry32(randomSeed())));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<main>
  <h1>🏘 {t.appTitle}</h1>
  <section>
    <div class="field">
      <span class="label">{t.players}</span>
      <div class="seg">
        {#each [2, 3, 4] as n}
          <button class:primary={count === n} onpointerup={() => setCount(n)}>{n}</button>
        {/each}
      </div>
    </div>

    {#each Array.from({ length: count }) as _, i}
      <div class="field playerRow">
        <input type="text" bind:value={names[i]} placeholder={`${t.playerName} ${i + 1}`} maxlength="14" />
        <select
          value={corners[i]}
          onchange={(e) => setCorner(i, Number((e.currentTarget as HTMLSelectElement).value))}
        >
          {#each [0, 1, 2, 3] as c}
            <option value={c}>{t.cornerNames[c]}</option>
          {/each}
        </select>
      </div>
    {/each}

    <label class="field toggle">
      <input type="checkbox" bind:checked={useMonuments} />
      <span>{t.useMonuments}</span>
    </label>

    {#if error}<div class="error">{error}</div>{/if}
    <button class="primary big" onpointerup={start}>{t.startGame}</button>
  </section>
</main>

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
  .toggle input { width: 20px; height: 20px; }
  .big { font-size: 17px; padding: 12px; margin-top: 6px; }
  .error { color: var(--danger); font-size: 13px; }
</style>
