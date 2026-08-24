<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { t } from '../i18n';

  // Update-Prüfung: beim Start (Registrierung), beim Zurückkehren in die App
  // (visibilitychange) und periodisch alle 15 Minuten.
  const CHECK_INTERVAL = 15 * 60 * 1000;

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => registration.update().catch(() => {}), CHECK_INTERVAL);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) registration.update().catch(() => {});
      });
    }
  });

  let dismissed = $state(false);
  let updating = $state(false);

  async function doUpdate() {
    if (updating) return;
    updating = true;
    // Neue SW-Version aktivieren; anschließend explizit neu laden
    // (der automatische Reload ist nicht in allen Plugin-Versionen zuverlässig).
    // Der Spielstand liegt im localStorage und übersteht den Reload.
    await updateServiceWorker(true);
    location.reload();
  }
</script>

{#if $needRefresh && !dismissed}
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
