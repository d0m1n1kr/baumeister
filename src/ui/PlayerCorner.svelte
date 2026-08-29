<script lang="ts">
  import { untrack } from 'svelte';
  import { game } from '../store/gameStore.svelte';
  import { drags } from '../store/dragStore.svelte';
  import { catalog } from '../data';
  import { matchingCards } from '../engine/patterns';
  import { suggestBuild, suggestPlacement } from '../engine/advice';
  import { hasFortIronweed, trainStopPlayer } from '../engine/game';
  import type { CardDef, Resource } from '../engine/types';
  import { dimsOf } from '../engine/types';
  import { cornerRotation, resLabel, RESOURCE_CSS } from './helpers';
  import { sfx } from './sound';
  import { panelReserve } from './panelReserve.svelte';
  import { learn } from './learn.svelte';
  import { cardName, cardText, t, translateError } from '../i18n';
  import BoardGrid from './BoardGrid.svelte';
  import CardMini from './CardMini.svelte';
  import CardOverlay from './CardOverlay.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import ResourcePicker from './ResourcePicker.svelte';

  import { session } from '../net/session.svelte';

  let {
    player,
    wide = false,
    solo = false,
    rotate = undefined
  }: { player: number; wide?: boolean; solo?: boolean; rotate?: number } = $props();

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
  // `rotate` überstimmt die Ecke: Zu zweit richtet sich die Drehung nach dem
  // Sitzplatz (unten/oben), damit sie zur Tischhälfte passt.
  const rotation = $derived(solo ? 0 : rotate ?? cornerRotation(p.corner));
  const isMB = $derived(st.masterBuilder === player);
  const inRound = $derived(st.phase.t === 'round');
  const namedResource = $derived(st.phase.t === 'round' ? st.phase.resource : null);
  const choice = $derived(p.choices[0]);

  // ---------- lokaler UI-Zustand ----------
  type Mode =
    | 'idle' | 'select' | 'target' | 'grovePlace' | 'claimPlace' | 'guildPick'
    | 'masonsPlace' | 'promenadePlace' | 'seedBonusPlace' | 'oddityPlace'
    | 'okaverPlace' | 'cathedralPlace';
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
    sfx.play('error');
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

  // Rundenwechsel oder „Fertig" beendet einen offenen Bau-Modus — sonst hinge
  // die Auswahl über die nächste Ansage hinweg fest (z. B. wenn die anderen
  // die Runde beenden, während hier noch markiert wird).
  $effect(() => {
    const stale = !inRound || p.roundDone || p.done;
    if (stale && untrack(() => mode) !== 'idle') resetMode();
  });

  // Regelverstöße meldet im Mehrgerätemodus der Host — hier anzeigen wie lokale Fehler.
  $effect(() => {
    const remote = session.netError;
    if (remote && canControl && session.role === 'guest') {
      showError(translateError(remote));
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
        .map((sq, i) => (!sq.building && !sq.terrain && (!sq.resource || resourceSquares.includes(i)) ? i : -1))
        .filter((i) => i >= 0);
      return [...new Set([...empty, ...resourceSquares])];
    }
    return resourceSquares;
  });

  const emptySquares = $derived(p.board.map((sq, i) => (!sq.building && !sq.resource && !sq.terrain ? i : -1)).filter((i) => i >= 0));
  const boardFull = $derived(emptySquares.length === 0);
  // Breite/Höhe des Bretts: klassisch 1, Landpartie 5/6 (hochkant). Damit
  // rechnet boardWrap seine Breite aus der verfügbaren Höhe.
  const boardRatio = $derived.by(() => {
    const { cols, rows } = dimsOf(p.board);
    return cols / rows;
  });
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
      mode === 'promenadePlace' || mode === 'seedBonusPlace' || mode === 'oddityPlace' ||
      mode === 'okaverPlace' || mode === 'cathedralPlace' ? emptySquares
    : mode === 'guildPick' ? p.board.map((sq, i) => (sq.building && catalog[sq.building.card].kind !== 'monument' ? i : -1)).filter((i) => i >= 0)
    : st.phase.t === 'seedPlacement' && p.seedSquare == null ? emptySquares
    : []
  );

  function oncell(square: number) {
    if (p.done || !canControl) return;
    const sq = p.board[square];
    // Tiny Trees: Samen setzen
    if (st.phase.t === 'seedPlacement') {
      if (p.seedSquare == null && !sq.building && !sq.resource && !sq.terrain) {
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
      case 'okaverPlace': {
        if (!emptySquares.includes(square)) return;
        showError(game.dispatch({ t: 'resolveOkaver', player, square }));
        resetMode();
        break;
      }
      case 'cathedralPlace': {
        if (!emptySquares.includes(square)) return;
        showError(game.dispatch({ t: 'resolveCathedral', player, pay: false, square }));
        resetMode();
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
        // Lagerhaus antippen, solange Material aussteht → einlagern/tauschen;
        // Museum antippen → Inhalt ansehen / passendes Material zurückgeben
        if (
          sq.building &&
          ((p.pending != null && (catalog[sq.building.card].effects ?? []).includes('warehouse')) ||
            (catalog[sq.building.card].effects ?? []).includes('museum'))
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
    if (cellEffects.includes('warehouse')) {
      if ((sq.building!.stored?.length ?? 0) < 3) {
        showError(game.dispatch({ t: 'warehouseStore', player, square }));
      } else {
        warehouseSquare = square;
      }
      return;
    }
    if (cellEffects.includes('museum')) {
      // Aufs Museum ziehen = passendes Material zurückgeben (+1 Münze)
      showError(game.dispatch({ t: 'museumSell', player, square }));
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
    inRound && (!isMB || st.config.solo) && p.pending != null && p.pending === namedResource &&
    p.board.some(
      (sq) => sq.building?.marked === namedResource &&
        (catalog[sq.building.card].effects ?? []).includes('factory')
    )
  );

  /** Fortune: Münztausch möglich (nur bei fremder Ansage — solo immer). */
  const coinSwapAvailable = $derived(
    coinsActive && inRound && (!isMB || st.config.solo) && !p.pendingLocked &&
    p.pending != null && p.pending === namedResource && p.coins >= 1
  );

  // ---------- Eisenbahn ----------
  // Der Zug hält an diesem Bahnhof und die Zug-Aktion ist noch offen
  const trainHere = $derived(
    inRound && p.pending != null && !p.trainUsed && trainStopPlayer(st, catalog) === player
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

  // ---------- Lernmodus ----------
  // Nur im Solospiel am eigenen Gerät: Erklärblasen und Zugvorschläge. Reine
  // Anzeige — die Vorschläge greifen nie selbst ein.
  const learning = $derived(learn.enabled && solo && !!st.config.solo && canControl && !p.done);
  const placeAdvice = $derived(
    learning && inRound && mode === 'idle' && p.pending != null
      ? suggestPlacement(st, player, p.pending, catalog)
      : null
  );
  const buildAdvice = $derived(
    learning && inRound && !p.roundDone ? suggestBuild(st, player, catalog) : null
  );
  const suggestSquares = $derived(
    mode === 'select' && buildAdvice ? buildAdvice.squares
    : mode === 'idle' && placeAdvice ? [placeAdvice.square]
    : []
  );
  const adviceText = $derived.by(() => {
    if (placeAdvice?.completes) {
      return t.learn.suggestCompletes(cardName(catalog[placeAdvice.completes]));
    }
    if (placeAdvice?.towards) {
      return t.learn.suggestTowards(
        cardName(catalog[placeAdvice.towards]), placeAdvice.have, placeAdvice.need
      );
    }
    if (buildAdvice && mode === 'idle') {
      return t.learn.suggestBuild(cardName(catalog[buildAdvice.card]));
    }
    return '';
  });

  // Die Blase entscheidet der Store — er kennt nur diese Lagemeldung.
  $effect(() => {
    if (!learning) {
      learn.ctx = null;
      return;
    }
    learn.ctx = {
      phase: st.phase.t,
      monumentPending: !p.monument,
      seedPending: p.seedSquare == null,
      offer: st.phase.t === 'nameResource' && isMB && !!st.soloOffer,
      pending: p.pending != null,
      swap: !!(factoryAvailable || coinSwapAvailable),
      trainHere,
      canBuild: !!buildAdvice,
      mode: mode === 'select' || mode === 'target' ? mode : mode === 'idle' ? 'idle' : 'other',
      boardFull,
      roundDone: p.roundDone,
      canFinish: inRound && !p.roundDone && p.pending == null
    };
    return () => (learn.ctx = null);
  });

  // ---------- Rathaus-Modus ----------
  const townHall = $derived(!!st.config.townHall);
  /** Laufende Rathaus-Runde mit freier Materialwahl (jede 3. Runde). */
  const freeChoice = $derived(inRound && st.phase.t === 'round' && st.phase.resource == null);
  /** Die nächste Runde ist eine Wahlrunde (fürs Knopf-Label des Bürgermeisters). */
  const nextIsFree = $derived((st.round + 1) % 3 === 0);
  const fortBlocked = $derived(
    freeChoice && hasFortIronweed(p, catalog) && st.players.filter((o) => !o.done).length > 1
  );
  const canPickFree = $derived(
    freeChoice && !p.done && !p.roundDone && p.pending == null &&
    p.placedSquare == null && !fortBlocked
  );
</script>

<div
  class="corner"
  class:wide
  class:soloCorner={solo}
  class:railed={!!st.train}
  style="transform: rotate({rotation}deg)"
>
  <header>
    <span class="pname" class:mb={isMB}>{isMB ? (townHall ? '🏛 ' : '👑 ') : ''}{p.name}</span>
    {#if coinsActive}
      {@const chestCap = 4 + (p.monument?.built && (catalog[p.monument.card].effects ?? []).includes('coinSlot') ? 1 : 0)}
      <span class="chest" title={t.coins}>
        {#each Array.from({ length: chestCap }) as _, i}
          <span class="slot" class:filled={i < p.coins}>{i < p.coins ? t.coinIcon : ''}</span>
        {/each}
      </span>
    {/if}
    {#if p.done}<span class="status done">{t.townComplete}</span>
    {:else if inRound && p.roundDone}<span class="status">{t.waitingForOthers}</span>{/if}
  </header>

  <div class="row" data-learn={solo ? 'play' : undefined}>
    <!-- boardArea misst den Restplatz, boardWrap hat exakt die Form des Bretts
         (klassisch quadratisch, Landpartie 5:6): Overlays (Gleis, Lern-Puls)
         liegen weiter am Brettrand, nicht am Rand eines gestreckten Kastens. -->
    <div class="boardArea">
    <div class="boardWrap" style="--ar: {boardRatio}">
      <BoardGrid
        {player}
        board={p.board}
        {selected}
        {highlights}
        suggest={suggestSquares}
        tentative={mode === 'idle' ? tentative : null}
        seed={treesActive && p.seedSquare != null && p.seedSquare >= 0 ? p.seedSquare : null}
        rail={!!st.train}
        trackEdge={st.train ? (rotation === 180 ? 'top' : 'bottom') : null}
        {oncell}
      />
      {#if mode === 'target'}<div class="hint">{t.chooseBuildTarget}</div>
      {:else if mode === 'grovePlace' || mode === 'claimPlace'}<div class="hint">{t.choosePlacement}</div>
      {:else if mode === 'guildPick' && guildSquare === null}<div class="hint">{t.guildPickBuilding}</div>{/if}
    </div>
    </div>

    <div class="panel" data-panel style="--panelReserve: {panelReserve.px}px">
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
          <!-- Solo-Ansicht: eigenes Gerät, niemand muss wegschauen -->
          <button
            class="primary"
            onpointerup={() => (solo ? (monumentPick = true) : (confirming = 'draft'))}
          >{t.monumentDraftButton}</button>
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
        {#if st.config.solo && st.soloOffer}
          <!-- Solo: eines der 3 offen ausliegenden Materialien wählen -->
          <span class="choiceTitle">{t.soloOfferTitle}</span>
          <div class="picker offer">
            {#each st.soloOffer as r, i}
              <button
                class="offerChip"
                style="background: {RESOURCE_CSS[r]}"
                title={t.resourceNames[r]}
                onpointerup={() => showError(game.dispatch({ t: 'soloPick', index: i }))}
              ><span class={resLabel(t.resourceNames[r])} data-res={r}>{t.resourceNames[r]}</span></button>
            {/each}
          </div>
          <span class="deckCount">{t.soloDeckCount(st.soloDeck?.length ?? 0)}</span>
        {:else if townHall}
          <!-- Rathaus: der Bürgermeister startet die Runde -->
          <button class="primary" onpointerup={() => showError(game.dispatch({ t: 'townHallDraw' }))}>
            {nextIsFree ? `✋ ${t.thStartFree}` : `🃏 ${t.thDraw}`}
          </button>
          <span class="deckCount">{t.thDeckCount(st.thDeck?.length ?? 0)}</span>
        {:else}
          <ResourcePicker disabled={bankBlocked} onpick={(r) => showError(game.dispatch({ t: 'nameResource', resource: r }))} />
        {/if}
      {/if}

      {#if canPickFree && canControl}
        <!-- Rathaus, jede 3. Runde: freie Materialwahl -->
        <ResourcePicker
          label={t.thFreePick}
          disabled={bankBlocked}
          onpick={(r) => showError(game.dispatch({ t: 'townHallPick', player, resource: r }))}
        />
      {/if}
      {#if freeChoice && fortBlocked && !p.roundDone && !p.done}
        <span class="status">{t.thFortSkip}</span>
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
              <span class={resLabel(t.resourceNames[p.pending])} data-res={p.pending}>
                {t.resourceNames[p.pending]}
              </span>
            </div>
            {#if factoryAvailable}
              <button onpointerup={() => (factoryDialog = true)}>⚙ {t.factorySwap}</button>
            {/if}
            {#if coinSwapAvailable}
              <button onpointerup={() => (coinDialog = true)}>{t.coinIcon} {t.coinSwap}</button>
            {/if}
            {#if st.config.systems.cavern && !isMB && (p.cavernUsed ?? 0) < 2}
              <button onpointerup={() => showError(game.dispatch({ t: 'cavern', player }))}>
                🕳 {t.cavernButton} ({2 - (p.cavernUsed ?? 0)})
              </button>
            {/if}
            {#if trainHere}
              <div class="trainStop">
                <span class="trainLabel">🚂 {t.trainStopTitle}</span>
                <div class="trainActions">
                  {#if st.train!.wagons.some((w) => w === null)}
                    <button onpointerup={() => showError(game.dispatch({ t: 'trainDrop', player }))}>
                      📦 {t.trainLoad}
                    </button>
                  {/if}
                  {#each st.train!.wagons as w, wi}
                    {#if w}
                      <button
                        class="wagonBtn"
                        title={t.trainSwapHint}
                        onpointerup={() => showError(game.dispatch({ t: 'trainSwap', player, wagon: wi }))}
                      >
                        🔁 <span class="dotBig" style="background: {RESOURCE_CSS[w]}"></span>
                      </button>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}

        {#if adviceText}
          <span class="learnTip">🎓 {t.learn.suggestion}: {adviceText}</span>
        {/if}

        {#if !choice}
          {#if mode === 'idle'}
            {#if !p.roundDone}
              <button class:learnPoint={learning && !!buildAdvice} onpointerup={() => (mode = 'select')}>🔨 {t.buildMode}</button>
            {/if}
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
          {#if mode === 'idle' && (p.pending == null || p.pendingLocked) && !p.roundDone && !canPickFree}
            {#if tentative != null}
              <span class="moveHint">{t.moveHint}</span>
            {/if}
            {#if p.pending != null && p.pendingLocked}
              <span class="moveHint">{t.semaphoreSkipHint}</span>
            {/if}
            <button
              class="primary"
              class:learnPoint={learning && !buildAdvice}
              onpointerup={() => showError(game.dispatch({ t: 'roundDone', player }))}
            >
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
          <span class="choiceTitle">{t.masonsTitle} ({p.coins} {t.coinIcon})</span>
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
          {#if !p.board.some((sq) => !sq.building && !sq.resource && !sq.coin && !sq.terrain)}
            <button onpointerup={() => { showError(game.dispatch({ t: 'resolvePromenade', player, square: null })); resetMode(); }}>
              {t.skip}
            </button>
          {/if}
        </div>
      {:else if choice?.t === 'museumStock'}
        <div class="choice">
          <ResourcePicker
            label={`${t.museumStockTitle} (${choice.remaining})`}
            onpick={(r) => showError(game.dispatch({ t: 'resolveMuseumStock', player, resource: r }))}
          />
        </div>
      {:else if choice?.t === 'cathedralChoice'}
        {@const grayCard = st.config.activeCards.find((c) => catalog[c]?.category === 'well')}
        <div class="choice">
          <span class="choiceTitle">{t.cathedralTitle}</span>
          <div class="btnRow">
            {#if p.coins >= 3}
              <button class="primary" onpointerup={() => showError(game.dispatch({ t: 'resolveCathedral', player, pay: true }))}>
                {t.coinIcon} {t.cathedralPay}
              </button>
            {/if}
            {#if grayCard}
              {#if (catalog[grayCard].effects ?? []).includes('buildAnywhereSelf')}
                <button onpointerup={() => (mode = 'cathedralPlace')}>
                  {t.cathedralTransform(cardName(catalog[grayCard]))}
                </button>
              {/if}
              <button onpointerup={() => showError(game.dispatch({ t: 'resolveCathedral', player, pay: false }))}>
                {t.cathedralTransformHere(cardName(catalog[grayCard]))}
              </button>
            {:else}
              <button onpointerup={() => showError(game.dispatch({ t: 'resolveCathedral', player, pay: false }))}>
                {t.skip}
              </button>
            {/if}
          </div>
          {#if mode === 'cathedralPlace'}
            <span class="choiceTitle">{t.choosePlacement}</span>
          {/if}
        </div>
      {:else if choice?.t === 'okaverCottage'}
        <div class="choice">
          <span class="choiceTitle">{t.okaverTitle}</span>
          {#if mode !== 'okaverPlace'}
            <button class="primary" disabled={emptySquares.length === 0} onpointerup={() => (mode = 'okaverPlace')}>
              {t.choosePlacement}
            </button>
          {/if}
          <button onpointerup={() => { showError(game.dispatch({ t: 'resolveOkaver', player, square: null })); resetMode(); }}>
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
        {#if solo && monumentDef}
          <!-- Eigenes Gerät: das Monument darf offen liegen -->
          <button class="monBuilt" onpointerup={() => (overlayCard = monumentDef)}>
            🏛 {cardName(monumentDef)}
          </button>
        {:else}
          <button class="monBack" onpointerup={() => (confirming = 'reveal')} title={t.monument}>
            <span>🏛</span>
            <span class="monLabel">{t.monument}</span>
          </button>
        {/if}
      {:else if p.monument?.built && monumentDef}
        <button class="monBuilt" onpointerup={() => (overlayCard = monumentDef)}>
          🏛 {cardName(monumentDef)} — {t.monumentBuilt}
        </button>
      {/if}

      <!-- key: neue Meldung startet das Schütteln auch, wenn schon eine steht -->
      {#if error}{#key error}<div class="error">{error}</div>{/key}{/if}
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
          }}><span class={resLabel(target.name)} data-res={target.resource}>{target.name}</span></button>
        {/each}
      </div>
      <button onpointerup={() => (oddityDialog = false)}>{t.cancel}</button>
    </div>
  </div>
{/if}

{#if warehouseSquare !== null && p.board[warehouseSquare]?.building}
  {@const wh = p.board[warehouseSquare].building!}
  {@const whEffects = catalog[wh.card].effects ?? []}
  {@const museumSellable =
    whEffects.includes('museum') && !p.museumSoldThisRound && (!isMB || st.config.solo) &&
    p.pending != null && p.pending === namedResource && !p.pendingLocked &&
    (wh.stored ?? []).includes(namedResource!)}
  <div class="scrim">
    <div class="pick" style="transform: rotate({rotation}deg)">
      <h3>{cardName(catalog[wh.card])}</h3>
      {#if whEffects.includes('museum') && wh.stored?.length}
        <span class="pickText">{t.museumContents}</span>
        <div class="btnRow">
          {#each wh.stored as r}
            <span class="chip" style="background: {RESOURCE_CSS[r]}">
              <span class={resLabel(t.resourceNames[r])} data-res={r}>{t.resourceNames[r]}</span>
            </span>
          {/each}
        </div>
      {/if}
      {#if museumSellable}
        <button class="primary" onpointerup={() => {
          showError(game.dispatch({ t: 'museumSell', player, square: warehouseSquare! }));
          warehouseSquare = null;
        }}>{t.coinIcon} {t.museumSell}</button>
      {/if}
      {#if whEffects.includes('warehouse') && p.pending != null && (wh.stored?.length ?? 0) < 3}
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
            }}><span class={resLabel(t.resourceNames[r])} data-res={r}>{t.resourceNames[r]}</span></button>
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
            <p class="pickText">{cardText(catalog[id])}</p>
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
  .pname { font-weight: 700; font-size: var(--fs-md); }
  .pname.mb { color: var(--accent); }
  .status { font-size: var(--fs-sm); color: var(--text-dim); }
  .status.done { color: var(--ok); font-weight: 700; }
  .chest { display: flex; gap: 2px; }
  .chest .slot {
    width: 18px;
    height: 18px;
    border-radius: var(--r-sm);
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(0, 0, 0, 0.25);
    display: grid;
    place-items: center;
    font-size: var(--fs-xs);
    line-height: 1;
  }
  .chest .slot.filled { border-color: var(--accent); }
  .prismToggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-sm);
    color: var(--text-dim);
    cursor: pointer;
  }
  .prismToggle input { width: 16px; height: 16px; }

  .row { display: flex; gap: 10px; flex: 1; min-height: 0; }
  /* Eckplätze (3–4 Spieler): Panel unter das Brett. Nebeneinander passen sie
     nicht mehr in den Quadranten, sobald das Brett ihn ausnutzt — der Knopf
     „Monument wählen" wurde am Zellenrand abgeschnitten. */
  .corner:not(.wide) .row { flex-direction: column; align-items: center; gap: 6px; }
  .corner:not(.wide) .row::before { display: none; }
  .corner:not(.wide) .boardArea { flex: 1 1 auto; width: 100%; align-self: center; }
  /* Alle Panels reservieren gleich viel Höhe (siehe panelReserve.svelte.ts) —
     sonst ist das Brett des Baumeisters kleiner als die der anderen und das
     Gleis passt zu keinem von beiden. Wo das Panel den Restplatz per flex: 1
     ohnehin gleich teilt (Handy hoch), wird die Reservierung unten auf 0
     zurückgesetzt. */
  .corner:not(.wide) .panel { flex: 0 1 auto; align-items: center; width: 100%; min-height: var(--panelReserve, 0px); }
  /* boardArea misst den Platz, der dem Brett in seiner Zelle bleibt; boardWrap
     ist das exakte Quadrat darin. Vorher war die Brettgröße viewport-relativ
     und nutzte nur 56 % des Quadranten — egal wie groß die Zelle war. */
  .boardArea {
    flex: 0 1 auto;
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
    container-type: size;
    align-self: stretch;
    width: min(46vw, 46vh);
  }
  .corner.wide .boardArea { width: min(60vw, 60vh); }
  .boardWrap {
    position: relative;
    /* Aus der Höhe wird die Breite über die Brettform: Ein 5:6-Brett ist bei
       gleicher Höhe schmaler als ein quadratisches. */
    width: min(100cqw, calc(100cqh * var(--ar, 1)));
    flex-shrink: 0;
  }
  /* Das BRETT muss mittig stehen, nicht die Gruppe aus Brett und Panel: Die
     oberen Spieler sind um 180° gedreht, eine mittige Gruppe spiegelt die
     Brettposition darin trotzdem. Gemessen standen obere und untere Reihe
     dadurch 207 px versetzt. Ein Ausgleichsraum links, so breit wie das Panel
     rechts, stellt das Brett in die Mitte — und gespiegelt bleibt es dort. */
  .row::before { content: ''; flex: 1 1 0; }
  .row { justify-content: center; }
  /* Panel nicht auf volle Restbreite strecken, damit die Gruppe mittig sitzt */
  .corner.wide .panel { flex: 0 1 360px; }
  /* Der Ausgleichsraum spiegelt das Panel exakt — gleiche Basis, gleiches
     Schrumpfen. Sonst schöbe er das Brett aus der Mitte, statt es zu halten. */
  .corner.wide .row::before { flex: 0 1 360px; }

  /* Ohne Container-Queries (Safari < 16) bleiben die bisherigen Maße */
  @supports not (container-type: size) {
    .boardArea { display: contents; }
    .boardWrap { width: min(calc(34vh * var(--ar, 1)), 24vw); align-self: flex-start; }
    .corner.wide .boardWrap { width: min(calc(32vh * var(--ar, 1)), 44vw); }
  }
  /* Handy quer: Bretter stehen nebeneinander — die Höhe ist der Maßstab */
  @media (orientation: landscape) and (max-height: 540px) {
    .corner.wide .boardArea { width: 100%; }
    .corner.wide .row { flex-direction: column; align-items: center; gap: 4px; }
    .row::before { display: none; }
    .boardArea { flex: 1 1 auto; width: 100%; align-self: center; }
    /* In der Spalte wäre die 360px-Basis eine HÖHE und würde dem Brett den
       ganzen Platz nehmen — zurück auf Inhaltshöhe. */
    .corner.wide .panel { align-items: center; width: 100%; flex: 0 1 auto; min-height: var(--panelReserve, 0px); }
  }
  .corner.wide header { justify-content: center; }
  @media (max-width: 700px) {
    .corner { padding: 4px; gap: 4px; }
    /* 2 Spieler am Handy: Brett mittig, Panel darunter */
    .corner.wide .row { flex-direction: column; align-items: center; gap: 4px; }
    .row::before { display: none; }
    .boardArea { flex: 1 1 auto; width: 100%; align-self: center; }
    /* align-self: flex-start (oben andocken) gilt nur im Zeilen-Layout —
       im Spalten-Layout würde es das Brett nach links statt mittig setzen */
    .corner.wide .boardArea { width: 100%; }
    .corner.wide .panel { align-items: center; width: 100%; flex: 0 1 auto; min-height: var(--panelReserve, 0px); }
    /* Solo: Das Panel nimmt nur, was es braucht — der Rest gehört dem Brett.
       Mit flex:1 auf beiden teilten sie sich den Platz, und das Brett blieb
       klein, obwohl unter dem einzigen Knopf 200 px frei standen.
       Die Reservierung bleibt aber als Untergrenze: Ohne sie fiel das Panel
       zwischen den Phasen von 116 auf 56 px zurück und das Brett rutschte bei
       jeder Materialansage auf und ab. */
    .corner.soloCorner .panel { flex: 0 1 auto; min-height: var(--panelReserve, 0px); overflow-y: auto; }
    .corner.wide header { justify-content: center; }
    /* Solo: Das Brett nimmt den Platz, der nach dem Panel übrig ist — statt
       einer festen Viewport-Größe, die weder mitwächst noch zurückweicht.
       Vorher blieben unter dem Brett 384 px ungenutzt, und sobald die Knöpfe
       auf Fingergröße wuchsen, lief das Panel über. */
    .corner.soloCorner .boardArea {
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      display: grid;
      place-items: center;
      container-type: size;
    }
    .corner.soloCorner .boardWrap { width: min(100cqw, calc(100cqh * var(--ar, 1))); }
    /* Ohne Container-Queries (Safari < 16) bleibt es beim bisherigen Maß */
    @supports not (container-type: size) {
      .corner.soloCorner .boardWrap { width: min(calc(30vh * var(--ar, 1)), 76vw); }
    }
    /* Platz für Gleis und Zug an der Brett-Unterkante — nur im Eisenbahn-Modus,
       sonst waren es 26 px, die den Knöpfen darunter fehlten */
    .corner.soloCorner.railed .boardWrap { margin-bottom: 26px; }
  }
  @media (max-width: 700px) and (orientation: portrait) {
    /* 3–4 Spieler am Handy: Die Eckzellen sind zu schmal für Brett + Knöpfe
       nebeneinander — die Knöpfe ragten aus dem Bild. Panel unters Brett. */
    .corner:not(.wide) .row { flex-direction: column; align-items: center; gap: 4px; }
    .row::before { display: none; }
    .boardArea { flex: 1 1 auto; width: 100%; align-self: center; }
    .corner:not(.wide) .boardArea { width: 100%; }
    .corner:not(.wide) .panel { align-items: center; width: 100%; flex: 1; min-height: 0; overflow-y: auto; }
    .corner:not(.wide) header { justify-content: center; }

    .panel button { font-size: var(--fs-sm); padding: 6px 9px; }
    .chip { min-width: 46px; height: 46px; border-radius: var(--r-pill); padding: 0 8px; }
  }
  .hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -20px;
    text-align: center;
    font-size: var(--fs-sm);
    color: var(--accent);
  }
  /* Das Panel legt seine Knöpfe NEBENeinander, nicht untereinander. Es sitzt
     unter dem Brett, also ist jede Panel-Zeile Höhe, die dem Brett fehlt: In
     der Runde schrumpfte das Brett dadurch von 316 auf 234 px. Was eine eigene
     Zeile braucht (Sätze, eigene Raster), sagt es unten selbst. */
  .panel {
    display: flex;
    flex-flow: row wrap;
    gap: 8px;
    flex: 1;
    min-width: 0;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    touch-action: pan-y;
  }
  /* Ganze Sätze und eigene Raster nehmen die Zeile für sich */
  .panel > .picker,
  .panel > .matches,
  .panel > .learnTip,
  .panel > .moveHint,
  .panel > .status,
  .panel > .choiceTitle { flex: 1 0 100%; text-align: center; }
  .panel button { font-size: var(--fs-sm); padding: 7px 12px; }

  /* Beschriftung, Marke und Zusatzknöpfe in einer Zeile — die Marke ist 46 px
     hoch, die Beschriftung 16: gestapelt kostete das 74 px Bretthöhe. */
  .pendingWrap {
    display: flex;
    flex-flow: row wrap;
    gap: 6px 8px;
    align-items: center;
    justify-content: center;
  }
  .pendingWrap .trainStop { flex: 1 0 100%; }

  /* Eisenbahn: Halt am Bahnhof */
  .trainStop {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    border: 1px dashed var(--accent);
    border-radius: var(--r-md);
  }
  .trainLabel { font-size: var(--fs-sm); font-weight: 700; color: var(--accent); }
  .trainActions { display: flex; flex-wrap: wrap; gap: 6px; }
  .wagonBtn { display: inline-flex; align-items: center; gap: 4px; }
  .dotBig {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid rgba(0, 0, 0, 0.4);
    display: inline-block;
  }
  .pendingLabel { font-size: var(--fs-xs); color: var(--text-dim); }
  /* Lernmodus: Zugvorschlag und der Knopf, der als Nächstes dran ist */
  .learnTip { font-size: var(--fs-xs); line-height: 1.35; color: var(--accent); }
  @media (prefers-reduced-motion: no-preference) {
    .panel button.learnPoint { animation: learnPoint 1.4s ease-in-out infinite; }
  }
  .panel button.learnPoint { border-color: var(--accent); }
  @keyframes learnPoint {
    0%, 100% { box-shadow: 0 0 0 0 rgba(232, 184, 75, 0.5); }
    50% { box-shadow: 0 0 0 5px rgba(232, 184, 75, 0); }
  }
  .moveHint { font-size: var(--fs-xs); color: var(--text-dim); }
  .chip {
    /* Kreis bei kurzen Namen, Kapsel bei langen — der Text bleibt einzeilig */
    min-width: 56px;
    height: 56px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    border: 3px solid rgba(255, 255, 255, 0.5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    display: grid;
    place-items: center;
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
    border-radius: var(--r-md);
    padding: 10px;
    width: 100%;
  }
  .choiceTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--accent); }
  .btnRow { display: flex; gap: 8px; }

  .monBack {
    display: flex;
    align-items: center;
    gap: 8px;
    background: repeating-linear-gradient(45deg, #5a4a6f, #5a4a6f 6px, #514263 6px, #514263 12px);
    border: 2px solid #7a6890;
    border-radius: var(--r-md);
    padding: 8px 12px;
  }
  .monLabel { font-size: var(--fs-sm); }
  .monBuilt { font-size: var(--fs-sm); background: rgba(205, 111, 156, 0.2); border-color: var(--cat-pink); }

  .error {
    background: var(--danger);
    color: #fff;
    font-size: var(--fs-sm);
    padding: 6px 10px;
    border-radius: var(--r-md);
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
    border-radius: var(--r-lg);
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
    border-radius: var(--r-md);
    padding: 10px;
  }
  @media (max-width: 700px) {
    /* Handy: Monumente untereinander statt nebeneinander */
    .pickRow { flex-direction: column; }
  }
  .pickText { font-size: var(--fs-sm); color: var(--text-dim); margin: 0; text-align: center; }
  .offer { display: flex; gap: 10px; justify-content: center; }
  .offerChip {
    /* Kreis bei kurzen Namen, Kapsel bei langen — der Text bleibt einzeilig */
    min-width: 56px;
    height: 56px;
    border-radius: var(--r-pill);
    border: 2px solid rgba(0, 0, 0, 0.35);
    display: grid;
    place-items: center;
    padding: 0 10px;
    line-height: 1;
  }
  .deckCount { font-size: var(--fs-xs); color: var(--text-dim); }
</style>
