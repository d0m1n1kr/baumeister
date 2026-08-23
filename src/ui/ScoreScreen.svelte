<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { catalog } from '../data';
  import { scoreGame } from '../engine/scoring';
  import { t } from '../i18n/de';

  const st = $derived(game.state!);
  const scores = $derived(scoreGame(st, catalog));
  const winnerIdx = $derived.by(() => {
    let best = 0;
    scores.forEach((s, i) => {
      if (
        s.total > scores[best].total ||
        (s.total === scores[best].total &&
          st.players[i].masterBuilderTurns < st.players[best].masterBuilderTurns)
      ) best = i;
    });
    return best;
  });

  // Alle Karten, die bei irgendjemandem Punkte/Zeilen erzeugt haben
  const cardRows = $derived.by(() => {
    const ids = new Set<string>();
    for (const s of scores) for (const l of s.lines) ids.add(l.card);
    return [...ids].sort((a, b) => catalog[a].name.de.localeCompare(catalog[b].name.de));
  });

  function lineFor(pi: number, card: string) {
    return scores[pi].lines.find((l) => l.card === card);
  }
</script>

<main>
  <h1>{t.scoreTitle}</h1>
  <p class="winner">🏆 {t.winner}: <strong>{st.players[winnerIdx].name}</strong> ({scores[winnerIdx].total} Punkte)</p>
  <div class="tableWrap">
    <table>
      <thead>
        <tr>
          <th></th>
          {#each st.players as p, i}
            <th class:win={i === winnerIdx}>{p.name}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each cardRows as card}
          <tr>
            <td class="cardName">{catalog[card].name.de}</td>
            {#each st.players as _, pi}
              {@const line = lineFor(pi, card)}
              <td>{line ? `${line.points > 0 ? '+' : ''}${line.points} (${line.count}×)` : '—'}</td>
            {/each}
          </tr>
        {/each}
        <tr>
          <td class="cardName">{t.scoreEmpty}</td>
          {#each scores as s}
            <td>{s.emptyPenalty} ({s.emptySquares})</td>
          {/each}
        </tr>
        {#if st.config.systems.coins}
          <tr>
            <td class="cardName">🪙 {t.coins}</td>
            {#each scores as s}
              <td>{s.coins ? `+${s.coins.points} (${s.coins.count}×)` : '—'}</td>
            {/each}
          </tr>
        {/if}
        {#if st.config.systems.trees}
          <tr>
            <td class="cardName">🌳 {t.tree}</td>
            {#each scores as s}
              <td>{s.treePoints ? `+${s.treePoints}` : '—'}</td>
            {/each}
          </tr>
        {/if}
        <tr class="totals">
          <td>{t.scoreTotal}</td>
          {#each scores as s, i}
            <td class:win={i === winnerIdx}>{s.total}</td>
          {/each}
        </tr>
      </tbody>
    </table>
  </div>
  <button class="primary big" onpointerup={() => game.reset()}>{t.playAgain}</button>
</main>

<style>
  main {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 20px;
  }
  h1 { margin: 0; }
  .winner { margin: 0; font-size: 18px; color: var(--accent); }
  .tableWrap {
    overflow: auto;
    max-height: 60vh;
    background: var(--bg-panel);
    border-radius: 12px;
    padding: 8px 14px;
  }
  table { border-collapse: collapse; font-size: 14px; }
  th, td { padding: 5px 14px; text-align: right; white-space: nowrap; }
  th { color: var(--accent); }
  .cardName { text-align: left; color: var(--text-dim); }
  .totals td { border-top: 2px solid rgba(255, 255, 255, 0.25); font-weight: 700; font-size: 16px; }
  .win { color: var(--accent); }
  .big { font-size: 16px; padding: 12px 22px; }
</style>
