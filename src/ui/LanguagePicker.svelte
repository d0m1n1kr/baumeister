<script lang="ts">
  // Sprachumschalter: Auswahl speichern und neu laden (Spielstand und
  // Mehrgeräte-Sitzung überleben den Reload — die App tritt selbst wieder bei).
  import { LANGUAGES, lang, setLanguage, t } from '../i18n';
</script>

<label class="langPicker" title={t.language}>
  <span aria-hidden="true">🌐</span>
  <select
    value={lang}
    aria-label={t.language}
    onchange={(e) => setLanguage((e.currentTarget as HTMLSelectElement).value)}
  >
    {#each LANGUAGES as l}
      <option value={l.code}>{l.name}</option>
    {/each}
  </select>
</label>

<style>
  .langPicker {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--fs-md);
    color: var(--muted, #889);
  }
  select {
    background: transparent;
    color: inherit;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: var(--r-md);
    padding: 4px 6px;
    font-size: var(--fs-sm);
  }
</style>
