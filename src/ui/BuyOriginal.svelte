<script lang="ts">
  // Herkunft und Kauf-Hinweis in einem Block: erst was das hier ist, dann wo
  // es das Original gibt. Ein Link, kein Skript, keine Provision — bewusst
  // kein Affiliate-Link (siehe shop.ts), damit das Projekt ein Fanprojekt
  // ohne geschäftlichen Zweck bleibt.
  import { buyUrl } from '../data/shop';
  import { lang, t } from '../i18n';
</script>

<div class="origin">
  <p class="basedOn">{t.basedOn}</p>
  <p class="buy">
    <span class="ask">{t.buyOriginal}</span>
    <a class="link tapArea" href={buyUrl(lang)} target="_blank" rel="noopener noreferrer">
      🛒 {t.buyOriginalLink}
    </a>
  </p>
</div>

<style>
  .origin {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-align: center;
    color: var(--text-dim);
  }
  .basedOn {
    margin: 0;
    font-size: var(--fs-xs);
    opacity: 0.8;
    max-width: 42ch;
  }
  .buy {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: center;
    gap: 4px 8px;
    font-size: var(--fs-sm);
  }
  .link {
    color: var(--accent);
    font-weight: 600;
    text-decoration: underline;
  }
</style>
