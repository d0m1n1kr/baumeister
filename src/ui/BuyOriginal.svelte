<script lang="ts">
  // „Kauf das Original hier" — ein Link, kein Skript. Die Werbekennzeichnung
  // und der Amazon-Partner-Hinweis erscheinen nur, wenn wirklich eine
  // Partner-ID eingetragen ist: ohne sie wäre der Satz einfach falsch.
  import { buyUrl, isAffiliate } from '../data/affiliate';
  import { lang, t } from '../i18n';

  const url = buyUrl(lang);
  const werbung = isAffiliate(lang);
</script>

<p class="buy">
  <span class="ask">{t.buyOriginal}</span>
  <a class="link tapArea" href={url} target="_blank" rel="sponsored noopener">🛒 {t.buyOriginalLink}</a>
  {#if werbung}<span class="note">{t.affiliateNote}</span>{/if}
</p>

<style>
  .buy {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: center;
    gap: 4px 8px;
    font-size: var(--fs-sm);
    color: var(--text-dim);
    text-align: center;
  }
  .link {
    color: var(--accent);
    font-weight: 600;
    text-decoration: underline;
  }
  /* Der Hinweis gehört dazu, soll aber nicht mit dem Link konkurrieren. */
  .note {
    flex-basis: 100%;
    font-size: var(--fs-xs);
    opacity: 0.8;
  }
</style>
