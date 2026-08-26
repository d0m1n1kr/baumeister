<script lang="ts">
  // Die Version kommt direkt aus package.json — eine Quelle, kein Nachziehen.
  // Antippen prüft auf eine neue Fassung: der zuverlässige Weg heraus, wenn
  // ein lange offener Tab auf seinem Stand sitzen bleibt.
  import { version } from '../../package.json';
  import { t } from '../i18n';
  import { updater } from './updater.svelte';
</script>

<footer>
  {#if updater.waiting}
    <button class="update" onpointerup={() => updater.apply()}>⬆ {t.updateNow} (v{version})</button>
  {:else}
    <button
      class="stamp"
      title={t.updateCheck}
      disabled={updater.checking}
      onpointerup={() => updater.check()}
    >
      v{version}
      {#if updater.checking}· …{:else if updater.checkedRecently}· {t.updateCurrent}{/if}
    </button>
  {/if}
  · Dominik Rössler &amp; Claude
</footer>

<style>
  footer {
    font-size: 11px;
    color: var(--text-dim);
    opacity: 0.75;
    text-align: center;
  }
  .stamp,
  .update {
    font: inherit;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    text-decoration: underline dotted;
  }
  .update { color: var(--accent); font-weight: 700; text-decoration: none; }
</style>
