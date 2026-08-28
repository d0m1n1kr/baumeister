// Kauf-Link zum Originalspiel („Kauf das Original hier").
//
// Die Partner-ID steht AUSSCHLIESSLICH hier, eine Zeile je Amazon-Land. Ohne
// ID ist es ein gewöhnlicher Shop-Link; sobald eine ID eingetragen ist, wird
// daraus ein Affiliate-Link — und die Oberfläche zeigt automatisch die
// Pflichtangaben dazu (Werbekennzeichnung + Amazon-Partner-Hinweis).
//
// Bewusst reine Daten und eine pure Funktion: kein Skript, kein Tracker, kein
// Netzzugriff. Die App bleibt offlinefähig, der Link führt erst beim Antippen
// hinaus.

export interface Shop {
  /** Amazon-Domain des Landes */
  host: string;
  /** Produktseite (ASIN) — unterscheidet sich je Land. Leer: Suchergebnis. */
  asin?: string;
  /** Partner-Tracking-ID dieses Landes. Leer: Link ohne Vergütung. */
  tag?: string;
}

/**
 * Sprache → Amazon-Land. Portugiesisch führt nach Spanien (Amazon hat keinen
 * eigenen Store in Portugal), Englisch in die USA.
 */
export const SHOPS: Record<string, Shop> = {
  de: { host: 'www.amazon.de' },
  en: { host: 'www.amazon.com' },
  fr: { host: 'www.amazon.fr' },
  es: { host: 'www.amazon.es' },
  it: { host: 'www.amazon.it' },
  nl: { host: 'www.amazon.nl' },
  pt: { host: 'www.amazon.es' },
  pl: { host: 'www.amazon.pl' }
};

/** Suchbegriff, solange keine ASIN eingetragen ist. */
const SUCHE = 'Tiny Towns';

const shopFor = (sprache: string): Shop => SHOPS[sprache] ?? SHOPS.en;

/** Verdient dieser Link etwas? Nur dann sind Werbehinweise nötig — und wahr. */
export function isAffiliate(sprache: string): boolean {
  return !!shopFor(sprache).tag;
}

/** Kauf-Link fürs Originalspiel, passend zum Land der gewählten Sprache. */
export function buyUrl(sprache: string): string {
  const shop = shopFor(sprache);
  const url = new URL(
    shop.asin ? `/dp/${shop.asin}` : `/s?k=${encodeURIComponent(SUCHE)}`,
    `https://${shop.host}`
  );
  if (shop.tag) url.searchParams.set('tag', shop.tag);
  return url.toString();
}
