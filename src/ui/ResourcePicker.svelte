<script lang="ts">
  import { RESOURCES, type Resource } from '../engine/types';
  import { RESOURCE_CSS } from './helpers';
  import { t } from '../i18n/de';

  let {
    label = t.pickResource,
    disabled = [],
    onpick
  }: { label?: string; disabled?: Resource[]; onpick: (r: Resource) => void } = $props();
</script>

<div class="picker">
  <span class="label">{label}</span>
  <div class="row">
    {#each RESOURCES as r}
      <button
        class="chip"
        style="background: {RESOURCE_CSS[r]}"
        disabled={disabled.includes(r)}
        onpointerup={() => onpick(r)}
        title={t.resourceNames[r]}
      >
        <span>{t.resourceNames[r]}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 6px; align-items: center; }
  .label { font-size: 13px; font-weight: 600; color: var(--accent); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .chip {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.35);
    display: grid;
    place-items: center;
    padding: 0;
  }
  .chip span {
    font-size: 9px;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.75);
    text-shadow: 0 1px 1px rgba(255, 255, 255, 0.3);
  }
  .chip:disabled { opacity: 0.25; }
</style>
