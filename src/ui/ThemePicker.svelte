<script lang="ts">
  // Theme-Umschalter: Anzeige-Präferenz je Gerät (wie die Sprache) —
  // Auswahl speichern und neu laden; Spielstand und Sitzung überleben das.
  import { THEMES, theme, setTheme, type ThemeId } from '../theme';
  import { t } from '../i18n';

  const NAMES: Record<ThemeId, string> = {
    classic: t.themeClassic,
    mars: t.themeMars,
    fantasy: t.themeFantasy
  };
</script>

<label class="themePicker" title={t.themeLabel}>
  <span aria-hidden="true">🎨</span>
  <select
    value={theme}
    aria-label={t.themeLabel}
    onchange={(e) => setTheme((e.currentTarget as HTMLSelectElement).value as ThemeId)}
  >
    {#each THEMES as th}
      <option value={th.id}>{NAMES[th.id]}</option>
    {/each}
  </select>
</label>

<style>
  .themePicker {
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
