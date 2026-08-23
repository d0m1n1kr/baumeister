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

  import { session } from '../net/session.svelte';

  let {
    player,
    wide = false,
    solo = false
  }: { player: number; wide?: boolean; solo?: boolean } = $props();

  /** Im Mehrgerätemodus darf jedes Gerät nur seine eigenen Plätze bedienen. */
  const canControl = $derived(session.controls(player));
  // Host-Tischansicht: Ein getrennter Remote-Platz lässt sich auch mitten im
  // Spiel ans Host-Gerät holen (z. B. wenn dem Mitspieler der Akku ausging).
  const canTakeOver = $derived(
    session.role === 'host' &&
    session.seats[player]?.kind === 'remote' &&
    !session.seats[player]?.connected
  );

  const st = $derived(game.state!);
  const p = $derived(st.players[player]);
  const rotation = $derived(solo ? 0 : cornerRotation(p.corner));
  const isMB = $derived(st.masterBuilder === player);
  const inRound = $derived(st.phase.t === 'round');
  const namedResource = $derived(st.phase.t === 'round' ? st.phase.resource : null);
  const choice = $derived(p.choices[0]);

  // ---------- lokaler UI-Zustand ----------
  type Mode =
    | 'idle' | 'select' | 'target' | 'grovePlace' | 'claimPlace' | 'guildPick'
    | 'masonsPlace' | 'promenadePlace' | 'seedBonusPlace' | 'oddityPlace';
  let mode = $state<Mode>('idle');
  let selected = $state<number[]>([]);
  let buildCard = $state<string | null>(null);
  let groveCard = $state<string | null>(null);
  let guildSquare = $state<number | null>(null);
  let warehouseSquare = $state<number | null>(null);
  let factoryDialog = $state(false);
  let coinDialog = $state(false);
  let oddityDialog = $state(false);
  let masonsCard = $state<string | null>(null);
  let seedBonusResource = $state<Resource | null>(null);
  let oddityFrom = $state<{ player: number; square: number } | null>(null);
  let usePrism = $state(false);
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
    masonsCard = null;
    seedBonusResource = null;
    oddityFrom = null;
    usePrism = false;
  }

  // Wenn eine neue Entscheidung ansteht, Bau-Modus verlassen
  $effect(() => {
    if (choice && (mode === 'select' || mode === 'target')) resetMode();
  });

  // Regelverstöße meldet im Mehrgerätemodus der Host — hier anzeigen wie lokale Fehler.
  $effect(() => {
    const remote = session.netError;
    if (remote && canControl && session.role === 'guest') {
      showError(remote);
      session.clearError();
    }
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
  const coinsActive = $derived(st.config.systems.coins);
  const treesActive = $derived(st.config.systems.trees);
  const prismAvailable = $derived(
    coinsActive && !p.prismUsedThisRound &&
    p.board.some((sq) => sq.building && (catalog[sq.building.card].effects ?? []).includes('prismForge'))
  );
  /** Fremde Kuriositätenläden mit Material (für den Baumeister-Zugriff). */
  const oddityTargets = $derived(
    st.phase.t === 'nameResource' && isMB && coinsActive && !st.oddityTaken
      ? st.players.flatMap((o, oi) =>
          oi === player
            ? []
            : o.board
                .map((sq, si) =>
                  sq.building?.stored?.length &&
                  (catalog[sq.building.card].effects ?? []).includes('oddityShop')
                    ? { player: oi, square: si, resource: sq.building.stored[0], name: o.name }
                    : null
                )
                .filter((x) => x !== null)
        )
      : []
  );
  const bondmakerBuilt = $derived(
    !!p.monument?.built && (catalog[p.monument.card].effects ?? []).includes('bondmaker')
  );
  /** Unbestätigt platziertes Material dieser Runde (per Tipp verschiebbar). */
  const tentative = $derived(
    inRound && !p.done && !p.roundDone && p.placedSquare != null &&
    p.board[p.placedSquare]?.resource
      ? p.placedSquare
      : null
  );

  const highlights = $derived(
    mode === 'target' ? targetSquares
    : mode === 'grovePlace' || mode === 'claimPlace' || mode === 'masonsPlace' ||
      mode === 'promenadePlace' || mode === 'seedBonusPlace' || mode === 'oddityPlace' ? emptySquares
    : mode === 'guildPick' ? p.board.map((sq, i) => (sq.building && catalog[sq.building.card].kind !== 'monument' ? i : -1)).filter((i) => i >= 0)
    : st.phase.t === 'seedPlacement' && p.seedSquare == null ? emptySquares
    : []
  );

  function oncell(square: number) {
    if (p.done || !canControl) return;
    const sq = p.board[square];
    // Tiny Trees: Samen setzen
    if (st.phase.t === 'seedPlacement') {
      if (p.seedSquare == null && !sq.building && !sq.resource) {
        showError(game.dispatch({ t: 'placeSeed', player, square }));
      }
      return;
    }
    switch (mode) {
      case 'masonsPlace': {
        if (!emptySquares.includes(square) || !masonsCard) return;
        showError(game.dispatch({ t: 'resolveMasons', player, card: masonsCard, square }));
        masonsCard = null;
        mode = 'idle';
        break;
      }
      case 'promenadePlace': {
        if (!emptySquares.includes(square)) return;
        showError(game.dispatch({ t: 'resolvePromenade', player, square }));
        if (!p.choices.some((c) => c.t === 'promenadeCoins')) mode = 'idle';
        break;
      }
      case 'seedBonusPlace': {
        if (!emptySquares.includes(square) || !seedBonusResource) return;
        showError(game.dispatch({ t: 'resolveSeedBonus', player, resource: seedBonusResource, square }));
        resetMode();
        break;
      }
      case 'oddityPlace': {
        if (!emptySquares.includes(square) || !oddityFrom) return;
        showError(game.dispatch({
          t: 'oddityTake', player,
          fromPlayer: oddityFrom.player, fromSquare: oddityFrom.square, targetSquare: square
        }));
        resetMode();
        break;
      }
      case 'select': {
        if (!sq.resource && !(sq.building && (catalog[sq.building.card].effects ?? []).includes('tradingPost'))) return;
        if (sq.resource && sq.building) return; // Bondmaker-Material nie verbaubar
        selected = selected.includes(square) ? selected.filter((i) => i !== square) : [...selected, square];
        break;
      }
      case 'target': {
        if (!targetSquares.includes(square) || !buildCard) return;
        showError(game.dispatch({
          t: 'build', player, squares: selected, card: buildCard, target: square,
          ...(usePrism ? { prism: true } : {})
        }));
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
        if (!inRound) break;
        // Lagerhaus/Museum antippen, solange Material aussteht → einlagern/tauschen/verkaufen
        if (
          p.pending != null && sq.building &&
          ((catalog[sq.building.card].effects ?? []).includes('warehouse') ||
            (catalog[sq.building.card].effects ?? []).includes('museum'))
        ) {
          warehouseSquare = square;
          break;
        }
        // Museum ohne pending: Verkauf möglich
        if (
          p.pending == null && sq.building && sq.building.stored?.length &&
          (catalog[sq.building.card].effects ?? []).includes('museum') && !p.museumSoldThisRound
        ) {
          warehouseSquare = square;
          break;
        }
        // Kuriositätenladen: fremd angesagtes Material ablegen
        if (
          p.pending != null && !isMB && sq.building &&
          (catalog[sq.building.card].effects ?? []).includes('oddityShop')
        ) {
          showError(game.dispatch({ t: 'oddityStore', player, square }));
          break;
        }
        // Tippen platziert das ausstehende Material
        if (p.pending != null && !sq.resource && (!sq.building || bondmakerBuilt)) {
          showError(game.dispatch({ t: 'placeResource', player, square }));
          break;
        }
        // Tippen verschiebt das unbestätigte Material dieser Runde
        if (
          p.pending == null && !p.roundDone && tentative != null && tentative !== square &&
          !sq.resource && (!sq.building || bondmakerBuilt)
        ) {
          showError(game.dispatch({ t: 'moveResource', player, square }));
        }
        break;
      }
    }
  }

  // ---------- Drag & Drop (Multi-Touch-fähig) ----------
  function chipDown(e: PointerEvent) {
    if (!inRound || p.pending == null || drags[player] || !canControl) return;
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
    const cellEffects = sq.building ? (catalog[sq.building.card].effects ?? []) : [];
    if (cellEffects.includes('warehouse') || cellEffects.includes('museum')) {
      const cap = cellEffects.includes('warehouse') ? 3 : 2;
      if ((sq.building!.stored?.length ?? 0) < cap) {
        showError(game.dispatch({ t: 'warehouseStore', player, square }));
      } else {
        warehouseSquare = square;
      }
      return;
    }
    if (cellEffects.includes('oddityShop') && !isMB) {
      showError(game.dispatch({ t: 'oddityStore', player, square }));
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

<div class="corner" class:wide style="transform: rotate({rotation}deg)">
  <header>
    <span class="pname" class:mb={isMB}>{isMB ? '👑 ' : ''}{p.name}</span>
    {#if coinsActive}
      <span class="chest" title={t.coins}>
        {#each Array.from({ length: 4 }) as _, i}
          <span class="slot" class:filled={i < p.coins}>{i < p.coins ? '🪙' : ''}</span>
        {/each}
      </span>
    {/if}
    {#if p.done}<span class="status done">{t.townComplete}</span>
    {:else if inRound && p.roundDone}<span class="status">{t.waitingForOthers}</span>{/if}
  </header>

  <div class="row">
    <div class="boardWrap">
      <BoardGrid
        {player}
        board={p.board}
        {selected}
        {highlights}
        tentative={mode === 'idle' ? tentative : null}
        seed={treesActive && p.seedSquare != null && p.seedSquare >= 0 ? p.seedSquare : null}
        {oncell}
      />
      {#if mode === 'target'}<div class="hint">{t.chooseBuildTarget}</div>
      {:else if mode === 'grovePlace' || mode === 'claimPlace'}<div class="hint">{t.choosePlacement}</div>
      {:else if mode === 'guildPick' && guildSquare === null}<div class="hint">{t.guildPickBuilding}</div>{/if}
    </div>

    <div class="panel">
      {#if !canControl}
        <!-- Fremder Platz (Host-Tischansicht): nur Status, keine Bedienung -->
        <span class="status">
          {#if canTakeOver}{t.disconnected}
          {:else if p.done}{t.townComplete}
          {:else if p.pending != null}{t.placeHint}
          {:else if p.roundDone}{t.waitingForOthers}
          {:else}—{/if}
        </span>
        {#if canTakeOver}
          <button onpointerup={() => session.takeOverSeat(player)}>{t.takeOverSeat}</button>
        {/if}
      {:else}
      {#if st.phase.t === 'monumentDraft'}
        {#if !p.monument}
          <button class="primary" onpointerup={() => (confirming = 'draft')}>{t.monumentDraftButton}</button>
        {:else}
          <span class="status">{t.monumentChosen} ✓</span>
        {/if}
      {/if}

      {#if st.phase.t === 'seedPlacement' && p.seedSquare == null}
        <span class="choiceTitle">🌱 {t.seedPlaceHint}</span>
      {/if}

      {#if st.phase.t === 'nameResource' && isMB && !p.done}
        {#if oddityTargets.length > 0 && mode !== 'oddityPlace'}
          <button onpointerup={() => (oddityDialog = true)}>🛍 {t.oddityTakeTitle}</button>
        {/if}
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
            {#if coinsActive && !isMB && !p.pendingLocked && p.pending === namedResource && p.coins >= 1}
              <button onpointerup={() => (coinDialog = true)}>🪙 {t.coinSwap}</button>
            {/if}
            {#if st.config.systems.cavern && !isMB && (p.cavernUsed ?? 0) < 2}
              <button onpointerup={() => showError(game.dispatch({ t: 'cavern', player }))}>
                🕳 {t.cavernButton} ({2 - (p.cavernUsed ?? 0)})
              </button>
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
          {#if (mode === 'select' || mode === 'target') && prismAvailable}
            <label class="prismToggle">
              <input type="checkbox" bind:checked={usePrism} />
              <span>✨ {t.prismToggle}</span>
            </label>
          {/if}
          {#if mode === 'idle' && p.pending == null && !p.roundDone}
            {#if tentative != null}
              <span class="moveHint">{t.moveHint}</span>
            {/if}
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
      {:else if choice?.t === 'masonsGuild'}
        <div class="choice">
          <span class="choiceTitle">{t.masonsTitle} ({p.coins} 🪙)</span>
          {#if mode !== 'masonsPlace'}
            <div class="matches">
              {#each st.config.activeCards.filter((id) => !choice.picked.includes(id)) as id}
                <CardMini card={catalog[id]} compact onclick={() => { masonsCard = id; mode = 'masonsPlace'; }} />
              {/each}
            </div>
          {:else}
            <span class="choiceTitle">{t.choosePlacement}</span>
          {/if}
          <button onpointerup={() => { showError(game.dispatch({ t: 'resolveMasons', player, card: null })); resetMode(); }}>
            {t.skip}
          </button>
        </div>
      {:else if choice?.t === 'promenadeCoins'}
        <div class="choice">
          <span class="choiceTitle">{t.promenadeTitle} ({choice.remaining})</span>
          {#if mode !== 'promenadePlace'}
            <button class="primary" onpointerup={() => (mode = 'promenadePlace')}>{t.choosePlacement}</button>
          {/if}
          <button onpointerup={() => { showError(game.dispatch({ t: 'resolvePromenade', player, square: null })); resetMode(); }}>
            {t.skip}
          </button>
        </div>
      {:else if choice?.t === 'seedBonus'}
        <div class="choice">
          <ResourcePicker
            label={t.seedBonusTitle}
            onpick={(r) => { seedBonusResource = r; mode = 'seedBonusPlace'; }}
          />
          {#if mode === 'seedBonusPlace'}
            <span class="choiceTitle">{t.choosePlacement}</span>
          {/if}
          <button onpointerup={() => { showError(game.dispatch({ t: 'resolveSeedBonus', player, resource: null })); resetMode(); }}>
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
      {/if}
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

{#if coinDialog}
  <div class="scrim">
    <div class="pick" style="transform: rotate({rotation}deg)">
      <ResourcePicker
        label={t.coinSwapHint}
        disabled={namedResource ? [namedResource] : []}
        onpick={(r) => {
          showError(game.dispatch({ t: 'coinSwap', player, take: r }));
          coinDialog = false;
        }}
      />
      <button onpointerup={() => (coinDialog = false)}>{t.cancel}</button>
    </div>
  </div>
{/if}

{#if oddityDialog}
  <div class="scrim">
    <div class="pick" style="transform: rotate({rotation}deg)">
      <h3>{t.oddityTakeTitle}</h3>
      <div class="btnRow">
        {#each oddityTargets as target}
          <button class="chip" style="background: {RESOURCE_CSS[target.resource]}" onpointerup={() => {
            oddityFrom = { player: target.player, square: target.square };
            oddityDialog = false;
            mode = 'oddityPlace';
          }}>{target.name}</button>
        {/each}
      </div>
      <button onpointerup={() => (oddityDialog = false)}>{t.cancel}</button>
    </div>
  </div>
{/if}

{#if warehouseSquare !== null && p.board[warehouseSquare]?.building}
  {@const wh = p.board[warehouseSquare].building!}
  {@const whEffects = catalog[wh.card].effects ?? []}
  {@const whCap = whEffects.includes('warehouse') ? 3 : 2}
  <div class="scrim">
    <div class="pick" style="transform: rotate({rotation}deg)">
      <h3>{catalog[wh.card].name.de}</h3>
      {#if whEffects.includes('museum') && wh.stored?.length && !p.museumSoldThisRound}
        <span class="pickText">{t.museumSell}</span>
        <div class="btnRow">
          {#each wh.stored as r, i}
            <button class="chip" style="background: {RESOURCE_CSS[r]}" onpointerup={() => {
              showError(game.dispatch({ t: 'museumSell', player, square: warehouseSquare!, storedIndex: i }));
              warehouseSquare = null;
            }}>{t.resourceNames[r]}</button>
          {/each}
        </div>
      {/if}
      {#if p.pending != null && (wh.stored?.length ?? 0) < whCap}
        <button class="primary" onpointerup={() => {
          showError(game.dispatch({ t: 'warehouseStore', player, square: warehouseSquare! }));
          warehouseSquare = null;
        }}>▦ {t.warehouseStore}</button>
      {/if}
      {#if whEffects.includes('warehouse') && wh.stored?.length && p.pending != null}
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
  .chest { display: flex; gap: 2px; }
  .chest .slot {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(0, 0, 0, 0.25);
    display: grid;
    place-items: center;
    font-size: 11px;
    line-height: 1;
  }
  .chest .slot.filled { border-color: var(--accent); }
  .prismToggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .prismToggle input { width: 16px; height: 16px; }

  .row { display: flex; gap: 10px; flex: 1; min-height: 0; }
  .boardWrap {
    position: relative;
    width: min(34vh, 24vw);
    flex-shrink: 0;
    align-self: flex-start;
  }
  .corner.wide .boardWrap { width: min(32vh, 44vw); }
  .corner.wide .row { justify-content: center; }
  /* Panel nicht auf volle Restbreite strecken, damit die Gruppe mittig sitzt */
  .corner.wide .panel { flex: 0 1 360px; }
  .corner.wide header { justify-content: center; }
  @media (max-width: 700px) {
    .corner { padding: 4px; gap: 4px; }
    /* 2 Spieler am Handy: Brett mittig, Panel darunter */
    .corner.wide .row { flex-direction: column; align-items: center; gap: 4px; }
    .corner.wide .boardWrap { width: min(26vh, 60vw); }
    .corner.wide .panel { align-items: center; width: 100%; flex: 1; }
    .corner.wide header { justify-content: center; }
    .boardWrap { width: min(26vh, 40vw); }
    .panel button { font-size: 12px; padding: 6px 9px; }
    .chip { width: 46px; height: 46px; }
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
    touch-action: pan-y;
  }
  .panel button { font-size: 13px; padding: 7px 12px; }

  .pendingWrap { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .pendingLabel { font-size: 11px; color: var(--text-dim); }
  .moveHint { font-size: 11px; color: var(--text-dim); }
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
    max-height: 90vh;
    overflow-y: auto;
    touch-action: pan-y;
  }
  .pick h3 { margin: 0; }
  .pickRow { display: flex; gap: 14px; width: 100%; }
  .pickCard {
    flex: 1;
    min-width: 0; /* Flex-Karten dürfen nicht aus dem Dialog wachsen */
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 10px;
  }
  @media (max-width: 700px) {
    /* Handy: Monumente untereinander statt nebeneinander */
    .pickRow { flex-direction: column; }
  }
  .pickText { font-size: 12px; color: var(--text-dim); margin: 0; text-align: center; }
</style>
