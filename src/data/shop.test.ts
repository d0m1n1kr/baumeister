// Der Link zum Originalspiel ist Daten plus eine pure Funktion.
import { describe, expect, it } from 'vitest';
import { SHOPS, buyUrl } from './shop';
import { LANGUAGES } from '../i18n';

describe('Link zum Originalspiel', () => {
  it('jede Sprache der App hat ein Amazon-Land', () => {
    // Sonst führte der Link stillschweigend in den falschen Store
    for (const { code } of LANGUAGES) {
      expect(SHOPS[code], `Sprache ${code}`).toMatch(/^www\.amazon\.[a-z.]+$/);
    }
  });

  it('führt in den Store der Sprache', () => {
    expect(buyUrl('de')).toContain('www.amazon.de');
    expect(buyUrl('pl')).toContain('www.amazon.pl');
    // Portugiesisch: Amazon hat keinen Store in Portugal
    expect(buyUrl('pt')).toContain('www.amazon.es');
    // Unbekannte Sprache landet nicht im Nichts
    expect(buyUrl('xx')).toContain('www.amazon.com');
  });

  it('ist kein Affiliate-Link — keine Partner-ID, kein Tracking-Parameter', () => {
    // Die bewusste Entscheidung gegen Monetarisierung: Ohne Provision bleibt
    // das Projekt ein Fanprojekt und braucht weder Werbekennzeichnung noch
    // Impressum. Wer hier eine ID einbaut, ändert diese Lage — der Test sagt es.
    for (const code of Object.keys(SHOPS)) {
      const url = new URL(buyUrl(code));
      expect([...url.searchParams.keys()]).toEqual(['k']);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toMatch(/(^|\.)amazon\./);
    }
  });

  it('sucht das Brettspiel, nicht diese App', () => {
    expect(decodeURIComponent(new URL(buyUrl('de')).searchParams.get('k')!))
      .toBe('Tiny Towns Brettspiel');
  });
});
