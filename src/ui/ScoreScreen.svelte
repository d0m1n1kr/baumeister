<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { session } from '../net/session.svelte';
  import { catalog } from '../data';
  import { scoreGame } from '../engine/scoring';
  import { soloRankIndex } from '../engine/registry';
  import { addHighscore, highscores, type HighscoreEntry } from '../store/highscore';
  import { cardName, t } from '../i18n';
  import { learn } from './learn.svelte';

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
    return [...ids].sort((a, b) => cardName(catalog[a]).localeCompare(cardName(catalog[b])));
  });

  function lineFor(pi: number, card: string) {
    return scores[pi].lines.find((l) => l.card === card);
  }

  // Solo: Rang bestimmen und Ergebnis genau EINMAL in die Bestenliste schreiben
  const solo = $derived(!!st.config.solo);
  const soloScore = $derived(scores[0]?.total ?? 0);
  const rank = $derived(t.soloRanks[soloRankIndex(soloScore)]);
  let place = $state<number | null>(null);
  let list = $state<HighscoreEntry[]>([]);
  $effect(() => {
    if (!solo) return;
    const id = st.config.gameId ?? 'unbekannt';
    try {
      if (localStorage.getItem('tinytowns.hsRecorded') !== id) {
        place = addHighscore({
          score: soloScore,
          rank,
          date: new Date().toISOString().slice(0, 10),
          dailyId: st.config.dailyId
        });
        localStorage.setItem('tinytowns.hsRecorded', id);
      }
    } catch {
      // privater Modus — dann ohne Bestenliste
    }
    list = highscores();
  });
</script>

<main>
  <h1>{t.scoreTitle}</h1>
  {#if solo}
    <p class="winner">
      🏆 {t.soloRankTitle}: <strong>{rank}</strong> ({soloScore} {t.points})
      {#if st.config.dailyId}<span class="daily">📅 {t.soloDaily} {st.config.dailyId}</span>{/if}
    </p>
    {#if place}<p class="best">⭐ {t.soloNewBest.replace('{n}', String(place))}</p>{/if}
  {:else}
    <p class="winner">🏆 {t.winner}: <strong>{st.players[winnerIdx].name}</strong> ({scores[winnerIdx].total} {t.points})</p>
  {/if}
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
            <td class="cardName">{cardName(catalog[card])}</td>
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
            <td class="cardName">{t.coinIcon} {t.coins}</td>
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
  {#if solo && list.length > 0}
    <div class="hs">
      <h2>{t.soloHighscores}</h2>
      <ol>
        {#each list.slice(0, 5) as e, i}
          <li class:hit={place === i + 1}>
            <strong>{e.score}</strong> — {t.soloRanks[soloRankIndex(e.score)]}
            <span class="hsMeta">{e.date}{e.dailyId ? ' · 📅' : ''}</span>
          </li>
        {/each}
      </ol>
    </div>
  {/if}

  {#if solo && learn.enabled}
    <!-- Abschluss des Lernspiels: was mit Mitspielern anders läuft -->
    <div class="learnBox">
      <h2>🎓 {t.learn.multiTitle}</h2>
      <ol>
        {#each t.learn.multiSteps as line}<li>{line}</li>{/each}
      </ol>
    </div>
  {/if}

  <button class="primary big" onpointerup={() => game.reset({ keepSave: session.role === 'guest' })}>{t.playAgain}</button>
</main>

<style>
  main {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Auto-Margins statt justify-content:center: zentriert, solange Platz
       ist, und scrollt sauber, wenn die Wertung länger wird (4 Spieler,
       Fortune) — center + overflow würde oben abschneiden. */
    gap: 16px;
    padding: 20px;
    padding-bottom: calc(20px + var(--safe-bottom));
    overflow-y: auto;
    touch-action: pan-y;
  }
  main > :first-child { margin-top: auto; }
  main > :last-child { margin-bottom: auto; }
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
  .daily { margin-left: 10px; font-size: 13px; color: var(--text-dim); }
  .best { margin: 0; color: var(--ok); font-weight: 700; }
  .hs { background: var(--bg-panel); border-radius: 12px; padding: 12px 18px; }
  .hs h2 { margin: 0 0 6px; font-size: 14px; }
  .hs ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
  .hs li.hit { color: var(--accent); }
  .hsMeta { color: var(--text-dim); font-size: 11px; margin-left: 6px; }
  .learnBox {
    background: var(--bg-panel);
    border: 1px solid var(--accent);
    border-radius: 12px;
    padding: 12px 18px;
    width: min(560px, 92vw);
  }
  .learnBox h2 { margin: 0 0 6px; font-size: 14px; color: var(--accent); }
  .learnBox ol {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    line-height: 1.45;
  }
</style>
