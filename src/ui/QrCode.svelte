<script lang="ts">
  // Die QR-Bibliothek wird nur in der Lobby gebraucht und daher erst dort
  // nachgeladen — der Ein-Gerät-Modus lädt sie nie.
  let { text, size = 200 }: { text: string; size?: number } = $props();

  let modules = $state<{ count: number; cells: { x: number; y: number }[] } | null>(null);

  $effect(() => {
    const wanted = text;
    let cancelled = false;
    void import('qrcode-generator').then(({ default: qrcode }) => {
      if (cancelled) return;
      // Fehlerkorrektur 'M' reicht für kurze URLs und bleibt gut scanbar.
      const qr = qrcode(0, 'M');
      qr.addData(wanted);
      qr.make();
      const count = qr.getModuleCount();
      const cells: { x: number; y: number }[] = [];
      for (let y = 0; y < count; y++) {
        for (let x = 0; x < count; x++) if (qr.isDark(y, x)) cells.push({ x, y });
      }
      modules = { count, cells };
    });
    return () => {
      cancelled = true;
    };
  });
</script>

{#if modules}
  <svg
    viewBox="-2 -2 {modules.count + 4} {modules.count + 4}"
    width={size}
    height={size}
    role="img"
    aria-label="QR-Code zum Beitreten"
  >
    <rect x="-2" y="-2" width={modules.count + 4} height={modules.count + 4} fill="#fff" />
    {#each modules.cells as cell}
      <rect x={cell.x} y={cell.y} width="1" height="1" fill="#1e2a38" />
    {/each}
  </svg>
{:else}
  <div class="placeholder" style="width: {size}px; height: {size}px"></div>
{/if}

<style>
  svg { border-radius: 8px; display: block; }
  .placeholder { background: rgba(255, 255, 255, 0.08); border-radius: 8px; }
</style>
