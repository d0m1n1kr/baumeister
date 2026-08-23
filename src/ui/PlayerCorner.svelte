<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { drags } from '../store/dragStore.svelte';
  import { catalog } from '../data';
  import { matchingCards } from '../engine/patterns';
  import type { CardDef, Resource } from '../engine/types';
  import { cornerRotation, RESOURCE_CSS } from './helpers';
  import { t } from '../i18n/de';
  import BoardGrid from './BoardGrid.svelte';
  import CardMini from './CardMini.svelte';
  import CardOverlay from './CardOverlay.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import ResourcePicker from './ResourcePicker.svelte';

  let { player }: { player: number } = $props();

  const st = $derived(game.state!);
  const p = $derived(st.players[player]);
  const rotation = $derived(cornerRotation(p.corner));
  const isMB = $derived(st.masterBuilder === player);
  const inRound = $derived(st.phase.t === 'round');
  const namedResource = $derived(st.phase.t === 'round' ? st.phase.resource : null);
  const choice = $derived(p.choices[0]);

  // ---------- lokaler UI-Zustand ----------
  type Mode = 'idle' | 'select' | 'target' | 'grovePlace' | 'claimPlace' | 'guildPick';
  let mode = $state<Mode>('idle');
  let selected = $state<number[]>([]);
  let buildCard = $state<string | null>(null);
  let groveCard = $state<string | null>(null);
  let guildSquare = $state<number | null>(null);
  let warehouseSquare = $state<number | null>(null);
  let factoryDialog = $state(false);
  let overlayCard = $state<CardDef | null>(null);
  let confirming = $state<'' | 'complete' | 'reveal' | 'draft'>('');
  let monumentPick = $state(false);
  let error = $state('');
  let errorTimer: ReturnType<typeof setTimeout> | undefined;

  function showError(msg: string | null) {
    if (!msg) return;
    error = msg;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => (error = ''), 2600);
  }

  function resetMode() {
    mode = 'idle';
    selected = [];
    buildCard = null;
    groveCard = null;
    guildSquare = null;
  }

  // Wenn eine neue Entscheidung ansteht, Bau-Modus verlassen
  $effect(() => {
    if (choice && (mode === 'select' || mode === 'target')) resetMode();
  });

  // ---------- Bauen ----------
  const candidates = $derived([
    ...st.config.activeCards,
    ...(p.monument && !p.monument.built ? [p.monument.card] : [])
  ]);
  const matches = $derived(
    mode === 'select' && selected.length > 0
      ? matchingCards(candidates, { board: p.board, squares: selected, catalog })
      : []
  );
  const anywhereAllowed = $derived(
    p.board.some((sq) => sq.building && (catalog[sq.building.card].effects ?? []).includes('buildAnywhereAll'))
  );

  const targetSquares = $derived.by(() => {
    if (mode !== 'target' || !buildCard) return [];
    const def = catalog[buildCard];
    const resourceSquares = selected.filter((i) => p.board[i].resource);
    if ((def.effects ?? []).includes('buildAnywhereSelf') || anywhereAllowed) {
      const empty = p.board
        .map((sq, i) => (!sq.building && (!sq.resource || resourceSquares.includes(i)) ? i : -1))
        .filter((i) => i >= 0);
      return [...new Set([...empty, ...resourceSquares])];
    }
    return resourceSquares;
  });

  const emptySquares = $derived(p.board.map((sq, i) => (!sq.building && !sq.resource ? i : -1)).filter((i) => i >= 0));
  const boardFull = $derived(emptySquares.length === 0);

  const highlights = $derived(
    mode === 'target' ? targetSquares : mode === 'grovePlace' || mode === 'claimPlace' ? emptySquares
    : mode === 'guildPick' ? p.board.map((sq, i) => (sq.building && catalog[sq.building.card].kind !== 'monument' ? i : -1)).filter((i) => i >= 0)
    : []
  );

  function oncell(square: number) {
    if (p.done) return;
    const sq = p.board[square];
    switch (mode) {
      case 'select': {
        if (!sq.resource && !(sq.building && (catalog[sq.building.card].effects ?? []).includes('tradingPost'))) return;
        if (sq.resource && sq.building) return; // Bondmaker-Material nie verbaubar
        selected = selected.includes(square) ? selected.filter((i) => i !== square) : [...selected, square];
        break;
      }
      case 'target': {
        if (!targetSquares.includes(square) || !buildCard) return;
        showError(game.dispatch({ t: 'build', player, squares: selected, card: buildCard, target: square }));
        resetMode();
        break;
      }
      case 'grovePlace': {
        if (!emptySquares.includes(square) || !groveCard) return;
        showError(game.dispatch({ t: 'resolveGrove', player, card: groveCard, square }));
        resetMode();
        break;
      }
      case 'claimPlace': {
        if (!emptySquares.includes(square)) return;
        showError(game.dispatch({ t: 'resolveOpaleyeClaim', player, accept: true, square }));
        resetMode();
        break;
      }
      case 'guildPick': {
        if (!highlights.includes(square)) return;
        guildSquare = square;
        break;
      }
      case 'idle': {
        // Lagerhaus antippen, solange Material aussteht → einlagern/tauschen
        if (
          inRound && p.pending != null && sq.building &&
          (catalog[sq.building.card].effects ?? []).includes('warehouse')
        ) {
          warehouseSquare = square;
        }
        break;
      }
    }
  }

  // ---------- Drag & Drop (Multi-Touch-fähig) ----------
  function chipDown(e: PointerEvent) {
    if (!inRound || p.pending == null || drags[player]) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drags[player] = { resource: p.pending, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  }
  function chipMove(e: PointerEvent) {
    const d = drags[player];
    if (!d || d.pointerId !== e.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
  }
  function chipUp(e: PointerEvent) {
    const d = drags[player];
    if (!d || d.pointerId !== e.pointerId) return;
    drags[player] = undefined;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest('[data-square]');
    if (!cell || Number(cell.getAttribute('data-player')) !== player) return;
    const square = Number(cell.getAttribute('data-square'));
    const sq = p.board[square];
    if (sq.building && (catalog[sq.building.card].effects ?? []).includes('warehouse')) {
      const stored = sq.building.stored?.length ?? 0;
      if (stored < 3) {
        showError(game.dispatch({ t: 'warehouseStore', player, square }));
      } else {
        warehouseSquare = square;
      }
      return;
    }
    showError(game.dispatch({ t: 'placeResource', player, square }));
  }

  // ---------- Fabrik ----------
  const factoryAvailable = $derived(
    inRound && !isMB && p.pending != null && p.pending === namedResource &&
    p.board.some(
      (sq) => sq.building?.marked === namedResource &&
        (catalog[sq.building.card].effects ?? []).includes('factory')
    )
  );

  // ---------- Monument ----------
  const monumentDef = $derived(p.monument ? catalog[p.monument.card] : null);

  function draftPick(card: string) {
    showError(game.dispatch({ t: 'chooseMonument', player, card }));
    monumentPick = false;
  }

  // ---------- Bank-Sperre für Baumeister ----------
  const bankBlocked = $derived(
    p.board
      .filter((sq) => sq.building?.marked && (catalog[sq.building!.card].effects ?? []).includes('bank'))
      .map((sq) => sq.building!.marked!) as Resource[]
  );

  const buildableSelection = $derived(mode === 'select' && selected.length > 0);
</script>

<div class="corner" style="transform: rotate({rotation}deg)">
  <header>
    <span class="pname" class:mb={isMB}>{isMB ? '👑 ' : ''}{p.name}</span>
    {#if p.done}<span class="status done">{t.townComplete}</span>
    {:else if inRound && p.roundDone}<span class="status">{t.waitingForOthers}</span>{/if}
  </header>

  <div class="row">
    <div class="boardWrap">
      <BoardGrid {player} board={p.board} {selected} {highlights} {oncell} />
      {#if mode === 'target'}<div class="hint">{t.chooseBuildTarget}</div>
      {:else if mode === 'grovePlace' || mode === 'claimPlace'}<div class="hint">{t.choosePlacement}</div>
      {:else if mode === 'guildPick' && guildSquare === null}<div class="hint">{t.guildPickBuilding}</div>{/if}
    </div>

    <div class="panel">
      {#if st.phase.t === 'monumentDraft'}
        {#if !p.monument}
          <button class="primary" onpointerup={() => (confirming = 'draft')}>{t.monumentDraftButton}</button>
        {:else}
          <span class="status">{t.monumentChosen} ✓</span>
        {/if}
      {/if}

      {#if st.phase.t === 'nameResource' && isMB && !p.done}
        <ResourcePicker disabled={bankBlocked} onpick={(r) => showError(game.dispatch({ t: 'nameResource', resource: r }))} />
      {/if}

      {#if inRound && !p.done}
        {#if p.pending != null}
          <div class="pendingWrap">
            <span class="pendingLabel">{t.placeHint}</span>
            <div
              class="chip"
              style="background: {RESOURCE_CSS[p.pending]}"
              role="button"
              tabindex="-1"
              onpointerdown={chipDown}
              onpointermove={chipMove}
              onpointerup={chipUp}
              onpointercancel={() => (drags[player] = undefined)}
            >
              {t.resourceNames[p.pending]}
            </div>
            {#if factoryAvailable}
              <button onpointerup={() => (factoryDialog = true)}>⚙ {t.factorySwap}</button>
            {/if}
          </div>
        {/if}

        {#if !choice}
          {#if mode === 'idle'}
            <button onpointerup={() => (mode = 'select')}>🔨 {t.buildMode}</button>
          {:else}
            <button onpointerup={resetMode}>{t.cancel}</button>
          {/if}
          {#if buildableSelection && matches.length > 0}
            <div class="matches">
              {#each matches as id}
                <CardMini
                  card={catalog[id]}
                  compact
                  onclick={() => { buildCard = id; mode = 'target'; }}
                />
              {/each}
            </div>
          {/if}
          {#if mode === 'idle' && p.pending == null && !p.roundDone}
            <button class="primary" onpointerup={() => showError(game.dispatch({ t: 'roundDone', player }))}>
              ✓ {t.roundDone}
            </button>
          {/if}
          {#if mode === 'idle' && boardFull && !p.roundDone}
            <button class="danger" onpointerup={() => (confirming = 'complete')}>{t.declareComplete}</button>
          {/if}
        {/if}
      {/if}

      <!-- Entscheidungen -->
      {#if choice?.t === 'markResource'}
        <div class="choice">
          <ResourcePicker
            label={t.markResourceTitle}
            onpick={(r) => showError(game.dispatch({ t: 'resolveMark', player, resource: r }))}
          />
        </div>
      {:else if choice?.t === 'groveUniversity'}
        <div class="choice">
          <span class="choiceTitle">{t.groveTitle}</span>
          <div class="matches">
            {#each st.config.activeCards as id}
              <CardMini card={catalog[id]} compact onclick={() => { groveCard = id; mode = 'grovePlace'; }} />
            {/each}
          </div>
          <button onpointerup={() => { showError(game.dispatch({ t: 'resolveGrove', player, card: null })); resetMode(); }}>
            {t.skip}
          </button>
        </div>
      {:else if choice?.t === 'architectsGuild'}
        <div class="choice">
          <span class="choiceTitle">{t.guildTitle} ({choice.remaining})</span>
          {#if mode !== 'guildPick'}
            <button class="primary" onpointerup={() => { mode = 'guildPick'; guildSquare = null; }}>
              {t.guildPickBuilding}
            </button>
          {:else if guildSquare !== null}
            <span class="choiceTitle">{t.guildPickNew}</span>
            <div class="matches">
              {#each st.config.activeCards as id}
                <CardMini card={catalog[id]} compact onclick={() => {
                  showError(game.dispatch({ t: 'resolveGuild', player, square: guildSquare, newCard: id }));
                  resetMode();
                }} />
              {/each}
            </div>
          {/if}
          <button onpointerup={() => { showError(game.dispatch({ t: 'resolveGuild', player, square: null })); resetMode(); }}>
            {t.skip}
          </button>
        </div>
      {:else if choice?.t === 'opaleyeSetup'}
        <div class="choice">
          <span class="choiceTitle">{t.opaleyeSetupTitle} ({choice.remaining})</span>
          <div class="matches">
            {#each st.config.activeCards.filter((id) => !(p.board[choice.square].building?.stock ?? []).includes(id)) as id}
              <CardMini card={catalog[id]} compact
                onclick={() => showError(game.dispatch({ t: 'resolveOpaleyeSetup', player, card: id }))} />
            {/each}
          </div>
          <button onpointerup={() => showError(game.dispatch({ t: 'resolveOpaleyeSetup', player, card: null }))}>
            {t.skip}
          </button>
        </div>
      {:else if choice?.t === 'opaleyeClaim'}
        <div class="choice">
          <span class="choiceTitle">{t.opaleyeClaimTitle}</span>
          <CardMini card={catalog[choice.card]} compact />
          <div class="btnRow">
            <button onpointerup={() => showError(game.dispatch({ t: 'resolveOpaleyeClaim', player, accept: false }))}>
              {t.decline}
            </button>
            <button class="primary" disabled={emptySquares.length === 0} onpointerup={() => (mode = 'claimPlace')}>
              {t.accept}
            </button>
          </div>
        </div>
      {/if}

      <!-- Monument-Slot -->
      {#if p.monument && !p.monument.built && st.phase.t !== 'monumentDraft'}
        <button class="monBack" onpointerup={() => (confirming = 'reveal')} title={t.monument}>
          <span>🏛</span>
          <span class="monLabel">{t.monument}</span>
        </button>
      {:else if p.monument?.built && monumentDef}
        <button class="monBuilt" onpointerup={() => (overlayCard = monumentDef)}>
          🏛 {monumentDef.name.de} — {t.monumentBuilt}
        </button>
      {/if}

      {#if error}<div class="error">{error}</div>{/if}
    </div>
  </div>
</div>

{#if confirming === 'draft' || confirming === 'reveal'}
  <ConfirmDialog
    title={t.monumentRevealTitle}
    text={t.monumentRevealText}
    {rotation}
    onconfirm={() => {
      const which = confirming;
      confirming = '';
      if (which === 'draft') monumentPick = true;
      else if (monumentDef) overlayCard = monumentDef;
    }}
    oncancel={() => (confirming = '')}
  />
{:else if confirming === 'complete'}
  <ConfirmDialog
    title={t.declareCompleteTitle}
    text={t.declareCompleteText}
    confirmLabel={t.declareComplete}
    danger
    {rotation}
    onconfirm={() => { confirming = ''; showError(game.dispatch({ t: 'declareComplete', player })); }}
    oncancel={() => (confirming = '')}
  />
{/if}

{#if factoryDialog}
  <div class="scrim">
    <div class="pick" style="transform: rotate({rotation}deg)">
      <ResourcePicker label={t.factorySwapHint} onpick={(r) => {
        showError(game.dispatch({ t: 'factorySwap', player, take: r }));
        factoryDialog = false;
      }} />
      <button onpointerup={() => (factoryDialog = false)}>{t.cancel}</button>
    </div>
  </div>
{/if}

{#if warehouseSquare !== null && p.board[warehouseSquare]?.building}
  {@const wh = p.board[warehouseSquare].building!}
  <div class="scrim">
    <div class="pick" style="transform: rotate({rotation}deg)">
      <h3>{t.warehouseTitle}</h3>
      {#if p.pending != null && (wh.stored?.length ?? 0) < 3}
        <button class="primary" onpointerup={() => {
          showError(game.dispatch({ t: 'warehouseStore', player, square: warehouseSquare! }));
          warehouseSquare = null;
        }}>▦ {t.warehouseStore}</button>
      {/if}
      {#if wh.stored?.length}
        <span class="pickText">{t.warehouseSwapHint}</span>
        <div class="btnRow">
          {#each wh.stored as r, i}
            <button class="chip" style="background: {RESOURCE_CSS[r]}" onpointerup={() => {
              showError(game.dispatch({ t: 'warehouseSwap', player, square: warehouseSquare!, storedIndex: i }));
              warehouseSquare = null;
            }}>{t.resourceNames[r]}</button>
          {/each}
        </div>
      {/if}
      <button onpointerup={() => (warehouseSquare = null)}>{t.cancel}</button>
    </div>
  </div>
{/if}

{#if monumentPick && p.monumentOptions}
  <div class="scrim">
    <div class="pick" style="transform: rotate({rotation}deg)">
      <h3>{t.monumentPick}</h3>
      <div class="pickRow">
        {#each p.monumentOptions as id}
          <div class="pickCard">
            <CardMini card={catalog[id]} />
            <p class="pickText">{catalog[id].text.de}</p>
            <button class="primary" onpointerup={() => draftPick(id)}>{t.confirm}</button>
          </div>
        {/each}
      </div>
      <button onpointerup={() => (monumentPick = false)}>{t.close}</button>
    </div>
  </div>
{/if}

{#if overlayCard}
  <CardOverlay card={overlayCard} {rotation} onclose={() => (overlayCard = null)} />
{/if}

<style>
  .corner {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }
  header { display: flex; align-items: center; gap: 10px; min-height: 22px; }
  .pname { font-weight: 700; font-size: 15px; }
  .pname.mb { color: var(--accent); }
  .status { font-size: 12px; color: var(--text-dim); }
  .status.done { color: var(--ok); font-weight: 700; }

  .row { display: flex; gap: 10px; flex: 1; min-height: 0; }
  .boardWrap {
    position: relative;
    width: min(34vh, 24vw);
    flex-shrink: 0;
    align-self: flex-start;
  }
  .hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -20px;
    text-align: center;
    font-size: 12px;
    color: var(--accent);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-width: 0;
    align-items: flex-start;
    overflow-y: auto;
  }
  .panel button { font-size: 13px; padding: 7px 12px; }

  .pendingWrap { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .pendingLabel { font-size: 11px; color: var(--text-dim); }
  .chip {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    display: grid;
    place-items: center;
    font-size: 10px;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.75);
    touch-action: none;
    cursor: grab;
  }
  .matches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
    gap: 6px;
    width: 100%;
  }
  .choice {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--accent);
    border-radius: 10px;
    padding: 10px;
    width: 100%;
  }
  .choiceTitle { font-size: 12px; font-weight: 700; color: var(--accent); }
  .btnRow { display: flex; gap: 8px; }

  .monBack {
    display: flex;
    align-items: center;
    gap: 8px;
    background: repeating-linear-gradient(45deg, #5a4a6f, #5a4a6f 6px, #514263 6px, #514263 12px);
    border: 2px solid #7a6890;
    border-radius: 8px;
    padding: 8px 12px;
  }
  .monLabel { font-size: 12px; }
  .monBuilt { font-size: 12px; background: rgba(205, 111, 156, 0.2); border-color: var(--cat-pink); }

  .error {
    background: var(--danger);
    color: #fff;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 8px;
    max-width: 100%;
  }

  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: grid;
    place-items: center;
    z-index: 105;
  }
  .pick {
    background: var(--bg-panel);
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    width: min(560px, 88vw);
  }
  .pick h3 { margin: 0; }
  .pickRow { display: flex; gap: 14px; width: 100%; }
  .pickCard {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 10px;
  }
  .pickText { font-size: 12px; color: var(--text-dim); margin: 0; text-align: center; }
</style>
