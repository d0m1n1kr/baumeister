<script lang="ts">
  // Kurzanleitung je Spielweise: gemeinsamer Rundenablauf plus die Eigenheiten
  // des gewählten Modus (ein Gerät / Host / Gast).
  import { t } from '../i18n';

  let { mode, onclose }: { mode: 'single' | 'host' | 'guest' | 'solo'; onclose: () => void } = $props();

  const section = $derived(
    mode === 'solo'
      ? { title: t.help.soloTitle, steps: t.help.soloSteps }
      : mode === 'single'
        ? { title: t.help.singleTitle, steps: t.help.singleSteps }
        : mode === 'host'
          ? { title: t.help.hostTitle, steps: t.help.hostSteps }
          : { title: t.help.guestTitle, steps: t.help.guestSteps }
  );
</script>

<div class="scrim" role="button" tabindex="-1" onpointerup={onclose}>
  <div class="dialog" role="dialog" tabindex="-1" onpointerup={(e) => e.stopPropagation()}>
    <h3>📖 {t.helpButton}</h3>

    <h4>{section.title}</h4>
    <ol>
      {#each section.steps as step}<li>{step}</li>{/each}
    </ol>

    <h4>{t.help.roundTitle}</h4>
    <ol>
      {#each t.help.roundSteps as step}<li>{step}</li>{/each}
    </ol>

    {#if mode !== 'solo'}
      <h4>{t.help.townhallTitle}</h4>
      <ol>
        {#each t.help.townhallSteps as step}<li>{step}</li>{/each}
      </ol>
    {/if}

    <h4>{t.help.fortuneTitle}</h4>
    <ol>
      {#each t.help.fortuneSteps as step}<li>{step}</li>{/each}
    </ol>

    <h4>{t.help.treesTitle}</h4>
    <ol>
      {#each t.help.treesSteps as step}<li>{step}</li>{/each}
    </ol>

    <p class="note">{t.help.cavernNote}</p>

    <button class="primary" onpointerup={onclose}>{t.close}</button>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    z-index: 85;
    border: none;
    padding: 12px;
  }
  .dialog {
    background: var(--bg-panel);
    border-radius: 14px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(460px, 94vw);
    max-height: 88vh;
    overflow-y: auto;
    touch-action: pan-y;
  }
  h3 { margin: 0 0 2px; font-size: 17px; text-align: center; }
  h4 { margin: 6px 0 0; font-size: 13px; color: var(--accent); }
  ol { margin: 2px 0; padding-left: 20px; display: flex; flex-direction: column; gap: 5px; }
  li { font-size: 13px; line-height: 1.45; }
  .note { margin: 4px 0 2px; font-size: 12px; color: var(--text-dim); line-height: 1.4; }
  button { margin-top: 6px; }
</style>
