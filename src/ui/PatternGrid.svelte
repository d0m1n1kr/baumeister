<script lang="ts">
  import type { Pattern } from '../engine/types';
  import { RESOURCE_CSS } from './helpers';

  let { pattern, cell = 10 }: { pattern: Pattern; cell?: number } = $props();
</script>

<div class="pgrid" style="grid-template-columns: repeat({pattern[0].length}, {cell}px);">
  {#each pattern as row}
    {#each row as c}
      <div
        class="pcell"
        class:empty={!c}
        style="width:{cell}px;height:{cell}px;{c ? `background:${RESOURCE_CSS[c]}` : ''}"
      ></div>
    {/each}
  {/each}
</div>

<style>
  .pgrid { display: grid; gap: 2px; width: max-content; }
  .pcell { border-radius: 2px; border: 1px solid rgba(0, 0, 0, 0.35); }
  .pcell.empty { border: 1px dashed rgba(0, 0, 0, 0.15); background: transparent; }
</style>
