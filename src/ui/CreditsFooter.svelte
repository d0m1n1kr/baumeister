<script lang="ts">
  // Die Version kommt direkt aus package.json — eine Quelle, kein Nachziehen.
  import { version } from '../../package.json';
</script>

<footer>v{version} · Dominik Rössler &amp; Claude</footer>

<style>
  footer {
    font-size: 11px;
    color: var(--text-dim);
    opacity: 0.75;
    text-align: center;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
</style>
