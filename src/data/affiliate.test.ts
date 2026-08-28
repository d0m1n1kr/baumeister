// Der Kauf-Link ist Daten plus eine pure Funktion — genau deshalb testbar.
import { describe, expect, it } from 'vitest';
import { SHOPS, buyUrl, isAffiliate } from './affiliate';
import type { Shop } from './affiliate';
import { LANGUAGES } from '../i18n';

describe('Kauf-Link zum Originalspiel', () => {
  it('jede Sprache der App hat ein Amazon-Land', () => {
    // Sonst führte der Link stillschweigend in den falschen Store
    for (const { code } of LANGUAGES) {
      expect(SHOPS[code], `Sprache ${code}`).toBeTruthy();
      expect(SHOPS[code].host).toMatch(/^www\.amazon\.[a-z.]+$/);
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

  it('ohne Partner-ID ein gewöhnlicher Link, mit ID ein Affiliate-Link', () => {
    const ohne: Shop = { host: 'www.amazon.de' };
    const mit: Shop = { host: 'www.amazon.de', tag: 'beispiel-21' };
    const bau = (shop: Shop) => {
      const gesichert = { ...SHOPS.de };
      Object.assign(SHOPS.de, shop, { tag: shop.tag ?? undefined });
      const url = buyUrl('de');
      const werbung = isAffiliate('de');
      Object.assign(SHOPS.de, gesichert);
      return { url, werbung };
    };
    const a = bau(ohne);
    expect(a.url).not.toContain('tag=');
    expect(a.werbung).toBe(false); // ohne ID wäre der Werbehinweis unwahr
    const b = bau(mit);
    expect(b.url).toContain('tag=beispiel-21');
    expect(b.werbung).toBe(true);
  });

  it('mit ASIN die Produktseite, sonst die Suche', () => {
    const gesichert = { ...SHOPS.de };
    Object.assign(SHOPS.de, { asin: 'B07Q2Q2WQ4' });
    expect(buyUrl('de')).toContain('/dp/B07Q2Q2WQ4');
    Object.assign(SHOPS.de, gesichert, { asin: undefined });
    expect(buyUrl('de')).toContain('/s?k=Tiny%20Towns');
  });

  it('immer https und nie eine andere Domain als Amazon', () => {
    for (const code of Object.keys(SHOPS)) {
      const url = new URL(buyUrl(code));
      expect(url.protocol).toBe('https:');
      expect(url.hostname.endsWith('.amazon.de') || /(^|\.)amazon\./.test(url.hostname)).toBe(true);
    }
  });
});
