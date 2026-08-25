<script lang="ts">
  import { t } from '../i18n';
  import { updater } from './updater.svelte';

  // „Später" gilt nur für den Moment: Beim nächsten Zurückkehren in die App
  // fragt der Hinweis wieder. Vorher blieb er nach einem Tipp für immer weg —
  // ein lange offener Tab hing damit auf seiner alten Fassung fest.
  let dismissed = $state(false);
  let updating = $state(false);

  $effect(() => {
    const back = () => {
      if (!document.hidden) dismissed = false;
    };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  });

  async function doUpdate() {
    if (updating) return;
    updating = true;
    await updater.apply();
  }
</script>

{#if updater.waiting && !dismissed}
  <div class="banner">
    <span>⬆ {t.updateAvailable}</span>
    <button class="primary" disabled={updating} onpointerup={doUpdate}>{t.updateNow}</button>
    <button onpointerup={() => (dismissed = true)}>{t.updateLater}</button>
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    left: 50%;
    bottom: calc(14px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-panel);
    border: 1px solid var(--accent);
    border-radius: 12px;
    padding: 8px 14px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    z-index: 200;
    font-size: 14px;
  }
  .banner button { font-size: 13px; padding: 6px 12px; }
</style>
