<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import { catalog } from '../data';
  import type { CardDef } from '../engine/types';
  import { RESOURCE_CSS } from './helpers';
  import { t } from '../i18n/de';
  import CardMini from './CardMini.svelte';
  import CardOverlay from './CardOverlay.svelte';

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

  let overlay = $state<{ card: CardDef; rotation: number } | null>(null);

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
      <button class="abort" onpointerup={() => onabort?.()} title={t.abortGame}>✕</button>
    </span>
    <span class="mb">👑 {st.players[st.masterBuilder].name}</span>
    {#if named}
      <span class="named">
        <span class="dot" style="background: {RESOURCE_CSS[named]}"></span>
        {t.resourceNames[named]}
      </span>
    {/if}
    {#if solo}
      <button class="aliceBtn" class:active={alice} onpointerup={toggleAlice} title={t.aliceModeHint}>
        📖 {t.aliceMode}
      </button>
    {/if}
  </div>
  <div class="cards" class:alice={aliceOn}>
    {#each [...st.config.activeCards, ...extraCards] as id}
      <div class="cardWrap">
        <CardMini
          card={catalog[id]}
          description={aliceOn ? catalog[id].text.de : ''}
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
    flex-wrap: wrap;
    justify-content: center;
    align-content: flex-start;
    row-gap: 8px;
    overflow-x: hidden;
    overflow-y: auto;
    touch-action: pan-y;
    max-height: 46vh;
  }
  .strip.horizontal .cards.alice .cardWrap { width: clamp(150px, 23vw, 210px); }
  @media (max-width: 720px) and (orientation: portrait) {
    /* Am Handy: zwei Spalten, Leiste fest gedeckelt und in sich scrollbar —
       das Spielbrett darunter muss immer erreichbar bleiben */
    .strip.soloStrip.horizontal .cards.alice {
      max-height: 30vh;
      overflow-y: auto;
      overflow-x: hidden;
      touch-action: pan-y;
      align-content: flex-start;
    }
    .strip.soloStrip.horizontal .cards.alice .cardWrap { width: calc(50% - 5px); }
  }
</style>
