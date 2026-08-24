<script lang="ts">
  // Kamera-Overlay zum Scannen des Beitritts-QR-Codes — wichtig für die
  // installierte PWA: Die iOS-Kamera-App würde den Link in Safari öffnen
  // statt in der App. jsQR wird erst hier nachgeladen (Ein-Gerät-Modus und
  // normale Beitritte laden es nie); der Chunk liegt trotzdem im Precache.
  import { t } from '../i18n';

  let {
    onresult,
    onclose
  }: {
    /** true = erledigt (Overlay schließt); false = weiterscannen (fremder QR). */
    onresult: (text: string) => boolean;
    onclose: () => void;
  } = $props();

  let video: HTMLVideoElement | undefined = $state();
  let error = $state('');

  $effect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    void (async () => {
      try {
        const { default: jsQR } = await import('jsqr');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (stopped || !video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();

        const tick = () => {
          if (stopped) return;
          if (video && ctx && video.readyState >= 2 && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (hit?.data && onresult(hit.data)) return;
            if (hit?.data) {
              // fremder QR im Bild: kurz warten, sonst feuert derselbe Treffer im Takt
              timer = setTimeout(tick, 700);
              return;
            }
          }
          timer = setTimeout(tick, 180); // ~5 Bilder/s reichen und schonen den Akku
        };
        tick();
      } catch {
        error = t.cameraError;
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  });
</script>

<div class="scrim" role="button" tabindex="-1" onpointerup={onclose}>
  <div class="dialog" role="dialog" tabindex="-1" onpointerup={(e) => e.stopPropagation()}>
    <h3>📷 {t.scanTitle}</h3>
    {#if error}
      <p class="error">{error}</p>
    {:else}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} playsinline muted></video>
      <p class="hint">{t.scanPrompt}</p>
    {/if}
    <button onpointerup={onclose}>{t.cancel}</button>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: grid;
    place-items: center;
    z-index: 90;
    border: none;
    padding: 12px;
  }
  .dialog {
    background: var(--bg-panel);
    border-radius: 14px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    width: min(380px, 94vw);
  }
  h3 { margin: 0; font-size: 16px; }
  video {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 10px;
    background: #000;
  }
  .hint { margin: 0; font-size: 12px; color: var(--text-dim); text-align: center; }
  .error { margin: 0; font-size: 13px; color: var(--danger); text-align: center; }
</style>
