import { describe, expect, it } from 'vitest';
import { dailyIdFromHash, dailyUrl, shareText, type ShareInfo, hashWithoutDaily} from './share';

const base: ShareInfo = {
  title: 'Tiny Towns',
  rank: 'Bürgermeisterin',
  score: 42,
  points: 'Punkte',
  dailyLabel: 'Tages-Challenge',
  buildings: [
    { name: 'Hütte', count: 5 },
    { name: 'Bauernhof', count: 2 }
  ],
  url: 'https://example.test/baumeister/'
};

describe('shareText', () => {
  it('nennt bei der Tages-Challenge das Datum in der Kopfzeile', () => {
    const text = shareText({ ...base, dailyId: '2026-08-26', url: 'u' });
    expect(text.split('\n')[0]).toBe('🏘 Tiny Towns — Tages-Challenge 2026-08-26');
  });

  it('lässt die Kopfzeile im freien Solo ohne Datum', () => {
    expect(shareText(base).split('\n')[0]).toBe('🏘 Tiny Towns');
  });

  it('nennt Rang und Punkte', () => {
    expect(shareText(base)).toContain('🏅 Bürgermeisterin · 42 Punkte');
  });

  it('verrät das Brett-Layout nicht, nur die Anzahl je Gebäude', () => {
    const text = shareText(base);
    expect(text).toContain('Hütte ×5 · Bauernhof ×2');
    // keine Rasterzeichen, aus denen sich Positionen ablesen ließen
    expect(text).not.toMatch(/[🟩🟫🟥⬜]/u);
  });

  it('lässt die Gebäudezeile weg, wenn nichts gebaut wurde', () => {
    const text = shareText({ ...base, buildings: [] });
    expect(text.split('\n')).toHaveLength(3);
  });

  it('setzt den Link in die letzte Zeile', () => {
    const lines = shareText(base).split('\n');
    expect(lines[lines.length - 1]).toBe('https://example.test/baumeister/');
  });
});

describe('dailyUrl', () => {
  it('hängt die Challenge als Hash an', () => {
    expect(dailyUrl('2026-08-26', 'https://example.test/tt/')).toBe(
      'https://example.test/tt/#daily=2026-08-26'
    );
  });

  it('ersetzt einen vorhandenen Hash, statt ihn zu stapeln', () => {
    expect(dailyUrl('2026-08-26', 'https://example.test/tt/#join=ABC234')).toBe(
      'https://example.test/tt/#daily=2026-08-26'
    );
  });
});

describe('dailyIdFromHash', () => {
  it('liest die Kennung', () => {
    expect(dailyIdFromHash('#daily=2026-08-26')).toEqual({ id: '2026-08-26', land: false });
  });

  it('liest sie auch hinter einem anderen Parameter', () => {
    expect(dailyIdFromHash('#x=1&daily=2026-01-02')).toEqual({ id: '2026-01-02', land: false });
  });

  it('erkennt den Landpartie-Marker', () => {
    expect(dailyIdFromHash('#daily=2026-08-27&mode=land')).toEqual({ id: '2026-08-27', land: true });
    expect(dailyIdFromHash('#daily=2026-08-27&mode=landx')).toEqual({ id: '2026-08-27', land: false });
  });

  it('weist alles zurück, was kein Datum ist', () => {
    expect(dailyIdFromHash('#daily=heute')).toBeNull();
    expect(dailyIdFromHash('#join=ABC234')).toBeNull();
    expect(dailyIdFromHash('')).toBeNull();
  });
});

describe('hashWithoutDaily', () => {
  it('entfernt den Tages-Parameter', () => {
    expect(hashWithoutDaily('#daily=2026-08-27')).toBe('');
    expect(hashWithoutDaily('#daily=2026-08-27&mode=land')).toBe('');
  });

  it('lässt andere Parameter stehen (QR-Raumcode)', () => {
    expect(hashWithoutDaily('#join=ABC234')).toBe('#join=ABC234');
    expect(hashWithoutDaily('#daily=2026-08-27&join=ABC234')).toBe('#join=ABC234');
  });

  it('kommt mit leerer Adresse zurecht', () => {
    expect(hashWithoutDaily('')).toBe('');
    expect(hashWithoutDaily('#')).toBe('');
  });
});

describe('Kauf-Link bleibt in der App', () => {
  it('der geteilte Text enthält keinen Amazon-Link', () => {
    // Amazon verbietet Partner-Links außerhalb der Website (E-Mail, Dateien,
    // Nachrichten). Der geteilte Text wandert genau dorthin.
    const text = shareText({
      title: 'Tiny Towns',
      rank: 'Baumeister',
      score: 21,
      points: 'Punkte',
      dailyId: '2026-08-27',
      dailyLabel: 'Tages-Challenge',
      buildings: [{ name: 'Hütte', count: 3 }],
      url: 'https://d0m1n1kr.github.io/baumeister/#daily=2026-08-27'
    });
    expect(text).not.toMatch(/amazon/i);
    expect(text).not.toMatch(/tag=/);
  });
});
