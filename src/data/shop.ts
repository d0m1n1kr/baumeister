// Link zum Originalspiel („Kauf das Original hier").
//
// Bewusst KEIN Affiliate-Link: keine Partner-ID, keine Provision, keine
// Werbekennzeichnung nötig — und das Projekt bleibt ein Fanprojekt ohne
// geschäftlichen Zweck. Der Link führt in die Amazon-Suche des Landes, das
// zur eingestellten Sprache passt.
//
// Reine Daten und eine pure Funktion: kein Skript, kein Tracker, kein
// Netzzugriff. Die App bleibt offlinefähig, der Link führt erst beim
// Antippen hinaus.

/**
 * Sprache → Amazon-Land. Portugiesisch führt nach Spanien (Amazon hat keinen
 * eigenen Store in Portugal), unbekannte Sprachen in die USA.
 */
export const SHOPS: Record<string, string> = {
  de: 'www.amazon.de',
  en: 'www.amazon.com',
  fr: 'www.amazon.fr',
  es: 'www.amazon.es',
  it: 'www.amazon.it',
  nl: 'www.amazon.nl',
  pt: 'www.amazon.es',
  pl: 'www.amazon.pl'
};

/** Gesucht wird nach dem Originalspiel — nicht nach dieser App. */
export const SUCHBEGRIFF = 'Tiny Towns Brettspiel';

/** Suchlink fürs Originalspiel, im Store zur gewählten Sprache. */
export function buyUrl(sprache: string): string {
  const host = SHOPS[sprache] ?? SHOPS.en;
  return `https://${host}/s?k=${encodeURIComponent(SUCHBEGRIFF)}`;
}
