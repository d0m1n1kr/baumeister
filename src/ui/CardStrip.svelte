<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { catalog } from '../data';
  import type { CardDef } from '../engine/types';
  import { RESOURCE_CSS } from './helpers';
  import { cardText, t } from '../i18n';
  import { trainStopPlayer } from '../engine/game';
  import CardMini from './CardMini.svelte';
  import CardOverlay from './CardOverlay.svelte';
  import { sfx } from './sound';

  let {
    onabort,
    horizontal = false,
    solo = false,
    extraCards = []
  }: {
    onabort?: () => void;
    horizontal?: boolean;
    solo?: boolean;
    /** Zusätzliche Karten (Einzelansicht: das eigene Monument). */
    extraCards?: string[];
  } = $props();

  const st = $derived(game.state!);
  const named = $derived(st.phase.t === 'round' ? st.phase.resource : null);

  // Eisenbahn: Halt/Vorbeifahrt/Tunnel für die Statuszeile
  const trainStatus = $derived.by(() => {
    const train = st.train;
    if (!train) return null;
    const stopAt = trainStopPlayer(st, catalog);
    if (stopAt != null) return t.trainAt(st.players[stopAt].name);
    if (train.pos < st.players.length) return t.trainPassing(st.players[train.pos].name);
    return t.trainTunnel;
  });

  // Alice-Modus (Einzelansicht): alle Karten dauerhaft samt Beschreibung offen,
  // damit niemand jede Karte einzeln antippen muss. Reine Anzeige-Präferenz
  // dieses Geräts — sie überlebt Reloads im localStorage.
  const ALICE_KEY = 'tinytowns.aliceMode';
  let alice = $state(readAlice());

  function readAlice(): boolean {
    try {
      return localStorage.getItem(ALICE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function toggleAlice() {
    alice = !alice;
    try {
      localStorage.setItem(ALICE_KEY, alice ? '1' : '0');
    } catch {
      // privater Modus — gilt dann nur für diese Sitzung
    }
  }

  const aliceOn = $derived(solo && alice);

  // Kartenauslage um 180° drehen — für die Spieler auf der Gegenseite des
  // Geräts. Reine Anzeige-Präferenz dieses Geräts, überlebt Reloads.
  const FLIP_KEY = 'tinytowns.stripFlip';
  let flipped = $state(readFlip());

  function readFlip(): boolean {
    try {
      return localStorage.getItem(FLIP_KEY) === '1';
    } catch {
      return false;
    }
  }

  function toggleFlip() {
    flipped = !flipped;
    try {
      localStorage.setItem(FLIP_KEY, flipped ? '1' : '0');
    } catch {
      // privater Modus — gilt dann nur für diese Sitzung
    }
  }

  // Gedreht auch in umgekehrter Reihenfolge, damit die Auslage für die
  // Gegenseite genauso liegt, als wäre die ganze Leiste gedreht.
  const cardIds = $derived(
    flipped && !solo
      ? [...st.config.activeCards, ...extraCards].reverse()
      : [...st.config.activeCards, ...extraCards]
  );

  let overlay = $state<{ card: CardDef; rotation: number } | null>(null);
  let soundOn = $state(sfx.enabled);

  function open(card: CardDef, e: PointerEvent) {
    // Am Spieltisch zum antippenden Spieler drehen (obere Hälfte = 180°);
    // in der Solo-Ansicht schaut nur einer aufs Gerät — immer aufrecht.
    overlay = { card, rotation: !solo && e.clientY < window.innerHeight / 2 ? 180 : 0 };
  }
</script>

<div class="strip" class:horizontal class:soloStrip={solo}>
  <div class="info">
    <span class="round">
      {t.round} {Math.max(1, st.round)}
      <button
        class="abort"
        onpointerup={() => (soundOn = sfx.toggle())}
        title={soundOn ? t.soundOff : t.soundOn}
      >{soundOn ? '🔊' : '🔇'}</button>
      {#if !solo}
        <button
          class="abort"
          class:flipActive={flipped}
          onpointerup={toggleFlip}
          title={t.flipCards}
        >🔄</button>
      {/if}
      <button class="abort" onpointerup={() => onabort?.()} title={t.abortGame}>✕</button>
    </span>
    <span class="mb">{st.config.townHall ? '🏛' : '👑'} {st.players[st.masterBuilder].name}</span>
    {#if named}
      <span class="named">
        <span class="dot" style="background: {RESOURCE_CSS[named]}"></span>
        {t.resourceNames[named]}
      </span>
    {/if}
    {#if st.train}
      <span class="trainInfo" title={trainStatus}>
        🚂
        {#each st.train.wagons as w}
          <span class="wagon" style={w ? `background: ${RESOURCE_CSS[w]}` : ''}></span>
        {/each}
      </span>
      <span class="trainWhere">{trainStatus}</span>
    {/if}
    {#if solo}
      <button class="aliceBtn" class:active={alice} onpointerup={toggleAlice} title={t.aliceModeHint}>
        📖 {t.aliceMode}
      </button>
    {/if}
  </div>
  <div class="cards" class:alice={aliceOn} class:flipped={flipped && !solo}>
    {#each cardIds as id}
      <div class="cardWrap">
        <CardMini
          card={catalog[id]}
          description={aliceOn ? cardText(catalog[id]) : ''}
          onclick={(e) => open(catalog[id], e)}
        />
      </div>
    {/each}
  </div>
</div>

{#if overlay}
  <CardOverlay card={overlay.card} rotation={overlay.rotation} onclose={() => (overlay = null)} />
{/if}

<style>
  .strip {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: rgba(0, 0, 0, 0.25);
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    padding: 8px 8px;
    overflow: hidden;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
    font-size: 11px;
    color: var(--text-dim);
    padding-bottom: 2px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .round { display: flex; align-items: center; gap: 8px; }
  .abort {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    padding: 0;
    font-size: 11px;
    opacity: 0.55;
    line-height: 1;
  }
  .mb { color: var(--accent); font-weight: 700; }
  .trainInfo { display: flex; align-items: center; gap: 3px; }
  .wagon {
    width: 11px;
    height: 9px;
    border-radius: 2px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.08);
    display: inline-block;
  }
  .trainWhere { font-size: 10px; color: var(--text-dim); text-align: center; }
  /* Am Handy: Der geparkte Zug auf den Gleisen zeigt die Position bereits —
     die Textzeile ist dort verzichtbar und die Leiste bleibt kompakt */
  @media (max-width: 700px), (max-height: 540px) {
    .trainWhere { display: none; }
  }
  .named { display: flex; align-items: center; gap: 5px; color: var(--text); font-weight: 600; }
  .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,0.4); }
  .cards {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    overflow-y: auto;
    touch-action: pan-y; /* Scrollen trotz globalem touch-action: none */
    scrollbar-width: thin;
  }
  .cardWrap { flex-shrink: 0; }

  /* Auslage für die Gegenseite: jede Karte um 180° gedreht (die Reihenfolge
     kehrt das Skript um — zusammen wirkt es wie eine gedrehte Leiste) */
  .cards.flipped .cardWrap { transform: rotate(180deg); }
  .flipActive {
    opacity: 1;
    border-color: var(--accent);
    color: var(--accent);
  }

  /* horizontale Leiste (2-Spieler-Modus / Hochformat) */
  .strip.horizontal {
    flex-direction: row;
    align-items: center;
    border-left: none;
    border-right: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 4px 8px;
    gap: 10px;
  }
  .strip.horizontal .info {
    border-bottom: none;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    padding-right: 10px;
    padding-bottom: 0;
    flex-shrink: 0;
  }
  .strip.horizontal .cards {
    flex-direction: row;
    overflow-y: hidden;
    overflow-x: auto;
    touch-action: pan-x;
    align-items: stretch;
    min-width: 0; /* Scroll-Container darf die Grid-Spalte nicht aufweiten */
  }
  .strip.horizontal .cardWrap { width: clamp(96px, 13vw, 130px); }

  /* Solo-Ansicht am Handy (Hochformat): alle Karten auf einen Blick, kein Scrollen */
  @media (max-width: 720px) and (orientation: portrait) {
    .strip.soloStrip.horizontal { flex-direction: column; gap: 4px; padding: 4px 6px; }
    .strip.soloStrip.horizontal .info {
      flex-direction: row;
      justify-content: center;
      gap: 12px;
      width: 100%;
      border-right: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0 0 3px;
    }
    .strip.soloStrip.horizontal .cards {
      flex-wrap: wrap;
      justify-content: center;
      row-gap: 5px;
      overflow: visible;
      touch-action: auto;
    }
    .strip.soloStrip.horizontal .cardWrap { width: calc(25% - 5px); }
  }

  /* Tablet-Hochformat (2 Spieler / Einzelansicht): genug Höhe — Karten
     umbrechen lassen statt horizontal zu scrollen */
  @media (orientation: portrait) and (min-height: 900px) {
    .strip.horizontal .cards:not(.alice) {
      flex-wrap: wrap;
      justify-content: center;
      row-gap: 6px;
      overflow: visible;
    }
  }

  /* Alice-Modus: Karten samt Beschreibung dauerhaft offen (Einzelansicht) */
  .aliceBtn {
    font-size: 11px;
    padding: 3px 8px;
    opacity: 0.7;
  }
  .aliceBtn.active {
    opacity: 1;
    border-color: var(--accent);
    color: var(--accent);
  }
  .strip.horizontal .cards.alice {
    /* Raster statt Flex: grid-auto-rows 1fr macht alle Karten gleich hoch */
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: 1fr;
    gap: 8px;
    width: min(100%, 900px);
    margin: 0 auto;
    overflow-x: hidden;
    overflow-y: auto;
    touch-action: pan-y;
    max-height: 46vh;
  }
  .strip.horizontal .cards.alice .cardWrap {
    width: auto;
    display: flex; /* Karte füllt die Rasterzelle in voller Höhe */
  }
  @media (max-width: 720px) and (orientation: portrait) {
    /* Am Handy: zwei Spalten, Leiste fest gedeckelt und in sich scrollbar —
       das Spielbrett darunter muss immer erreichbar bleiben */
    .strip.soloStrip.horizontal .cards.alice {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 5px;
      max-height: 30vh;
    }
    .strip.soloStrip.horizontal .cards.alice .cardWrap { width: auto; }
  }
</style>
