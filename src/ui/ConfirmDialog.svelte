<script lang="ts">
  import { t } from '../i18n';

  let {
    title,
    text = '',
    confirmLabel = t.confirm,
    cancelLabel = t.cancel,
    rotation = 0,
    danger = false,
    onconfirm,
    oncancel
  }: {
    title: string;
    text?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    rotation?: number;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();
</script>

<div class="scrim">
  <div class="box" style="transform: rotate({rotation}deg)">
    <h3>{title}</h3>
    {#if text}<p>{text}</p>{/if}
    <div class="buttons">
      <button onpointerup={oncancel}>{cancelLabel}</button>
      <button class={danger ? 'danger' : 'primary'} onpointerup={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: grid;
    place-items: center;
    z-index: 110;
  }
  .box {
    background: var(--bg-panel);
    border-radius: 14px;
    padding: 20px 24px;
    width: min(360px, 78vw);
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
  }
  h3 { margin: 0; font-size: 19px; }
  p { margin: 0; color: var(--text-dim); line-height: 1.4; }
  .buttons { display: flex; justify-content: flex-end; gap: 10px; }
</style>
