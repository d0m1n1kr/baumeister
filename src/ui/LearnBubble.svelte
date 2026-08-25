<script lang="ts">
  // Erklärblase des Lernmodus. Sie sitzt immer ÜBER dem Spielbereich (nur wenn
  // dort kein Platz ist darunter) und niemals über Brett oder Knöpfen — am
  // Handy war jeder Pixel über den Bedienelementen ein verlorener Zug.
  // Der Kasten selbst lässt Zeiger durch; nur seine Knöpfe fangen sie.
  import { t } from '../i18n';
  import type { LearnStepId } from './learnSteps';

  let {
    step,
    ondismiss,
    onoff
  }: { step: LearnStepId; ondismiss: () => void; onoff: () => void } = $props();

  const text = $derived(t.learn.steps[step]);

  let el = $state<HTMLDivElement | undefined>(undefined);
  type Arrow = 'up' | 'down' | 'none';
  let left = $state(8);
  let top = $state(8);
  let arrow = $state<Arrow>('none');
  let ready = $state(false);

  // Am Handy ist der Mehrspieler-Hinweis erst auf Tippen sichtbar — sonst
  // wächst die Blase über die halbe Spielfläche.
  let wide = $state(true);
  let showMp = $state(false);
  $effect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(min-width: 721px) and (min-height: 541px)');
    const update = () => (wide = mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  /**
   * Freien Platz suchen: Die Blase darf Brett und Bedienelemente nie
   * überdecken. Der Panel-Kasten ist gestreckt, seine Kinder sind es nicht —
   * deshalb werden die KINDER als Sperrflächen gemessen, nicht das Panel.
   */
  function place() {
    const bubble = el;
    if (!bubble) return;
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const safe =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
    const gap = 8;
    const play = document.querySelector('[data-learn="play"]')?.getBoundingClientRect();
    if (!play || play.height === 0) {
      left = Math.max(8, (vw - w) / 2);
      top = Math.max(8, (vh - safe - h) / 2);
      arrow = 'none';
      ready = true;
      return;
    }
    const board = document.querySelector('[data-learn="play"] .boardWrap')?.getBoundingClientRect();
    const keep = [
      ...(board ? [board] : []),
      ...[...document.querySelectorAll('[data-learn="play"] .panel > *')].map((n) =>
        n.getBoundingClientRect()
      )
    ].filter((r) => r.width > 0 && r.height > 0);

    const clampX = (x: number) => Math.min(Math.max(8, x), Math.max(8, vw - w - 8));
    const fits = (x: number, y: number) =>
      x >= 4 && y >= 4 && x + w <= vw - 4 && y + h <= vh - safe - 4 &&
      !keep.some((r) => x < r.right - 1 && r.left < x + w - 1 && y < r.bottom - 1 && r.top < y + h - 1);

    const middle = clampX(play.left + play.width / 2 - w / 2);
    const belowAll = Math.max(...keep.map((r) => r.bottom), play.top) + gap;
    const candidates: { x: number; y: number; arrow: Arrow }[] = [
      // unter allem, was bedient wird — in Leserichtung nach den Knöpfen
      { x: middle, y: belowAll, arrow: 'up' },
      // über dem Spielbereich (dort liegt die Kartenleiste, kein Bedienelement)
      { x: middle, y: play.top - gap - h, arrow: 'down' },
      // neben dem Brett (breiter Tisch)
      ...(board ? [{ x: board.right + gap, y: board.top, arrow: 'none' as Arrow }] : []),
      // unter dem Spielbereich
      { x: middle, y: play.bottom + gap, arrow: 'up' }
    ];
    const hit = candidates.find((c) => fits(c.x, c.y));
    if (hit) {
      left = hit.x;
      top = hit.y;
      arrow = hit.arrow;
    } else {
      // Enger Bildschirm: oben anlegen und lieber die Karten überdecken
      left = clampX(play.left + play.width / 2 - w / 2);
      top = 4;
      arrow = 'none';
    }
    ready = true;
  }

  $effect(() => {
    step; // Positionsneuberechnung bei jedem Schrittwechsel
    showMp;
    if (!el) return;
    const frame = requestAnimationFrame(place);
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  });
</script>

<div
  class="bubble"
  class:ready
  bind:this={el}
  style="left: {left}px; top: {top}px"
>
  <span class="title">🎓 {text.title}</span>
  <p class="body">{text.body}</p>
  {#if wide || showMp}
    <p class="mp"><span class="mpLabel">👥 {t.learn.multiplayer}:</span> {text.mp}</p>
  {:else}
    <button class="link" onpointerup={() => (showMp = true)}>👥 {t.learn.multiplayer}</button>
  {/if}
  <div class="row">
    <button class="primary" onpointerup={ondismiss}>{t.learn.gotIt}</button>
    <button class="off" onpointerup={onoff}>{t.learn.hideTips}</button>
  </div>
  {#if arrow !== 'none'}<span class="arrow" class:up={arrow === 'up'}></span>{/if}
</div>

<style>
  .bubble {
    position: fixed;
    z-index: 70;
    width: min(280px, calc(100vw - 16px));
    background: var(--bg-panel);
    border: 1px solid var(--accent);
    border-radius: 12px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
    padding: 9px 11px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    /* Der Kasten darf keine Eingabe abfangen — nur die Knöpfe */
    pointer-events: none;
    /* bis zur ersten Messung unsichtbar, damit sie nicht springt */
    opacity: 0;
  }
  .bubble.ready { opacity: 1; }
  @media (prefers-reduced-motion: no-preference) {
    .bubble.ready { animation: bubbleIn 200ms ease-out; }
  }
  @keyframes bubbleIn { from { opacity: 0; translate: 0 6px; } }
  .title { font-size: 13px; font-weight: 700; color: var(--accent); }
  .body { margin: 0; font-size: 12px; line-height: 1.4; }
  .mp {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-dim);
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    padding-top: 4px;
  }
  .mpLabel { font-weight: 700; }
  .row { display: flex; gap: 6px; justify-content: flex-end; }
  .row button, .link { pointer-events: auto; }
  .row button { font-size: 12px; padding: 5px 10px; }
  .off { opacity: 0.7; font-size: 11px; }
  .link {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    font-size: 11px;
    color: var(--text-dim);
    text-decoration: underline;
  }
  /* Zeiger zum Spielbereich */
  .arrow {
    position: absolute;
    left: 50%;
    translate: -50% 0;
    width: 0;
    height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 7px solid var(--accent);
    bottom: -7px;
  }
  .arrow.up {
    bottom: auto;
    top: -7px;
    border-top: none;
    border-bottom: 7px solid var(--accent);
  }
</style>
