import { describe, it, expect } from 'vitest';
import { placements, suggestBuild, suggestPlacement } from './advice';
import { catalog, freshGame, inRound, put, res } from './test-helpers';
import type { GameState } from './types';

// Muster der Standard-Auslage (Zeile*4 + Spalte):
//   cottage  [[·, wheat], [brick, glass]]
//   farm     [[wheat, wheat], [wood, wood]]
//   well     [[wood, stone]]
//   tavern   [[brick, brick, glass]]

function solo(activeCards?: string[]): GameState {
  const s = freshGame(1, activeCards, false);
  s.config.solo = true;
  return s;
}

describe('Lernmodus: erreichbare Musterlagen', () => {
  it('findet auf dem leeren Brett jede Lage und zählt die fehlenden Felder', () => {
    const s = freshGame(1, ['well']);
    const pls = placements(s.players[0].board, catalog, ['well']);
    // Brunnen (Holz–Stein): 4 Orientierungen (2× waagerecht, 2× senkrecht)
    // à 12 Lagen — die Spiegelung ist eine eigene Lage
    expect(pls).toHaveLength(48);
    for (const pl of pls) {
      expect(pl.filled).toBe(0);
      expect(pl.missing).toHaveLength(2);
    }
  });

  it('schließt Lagen mit falschem Material oder Gebäude aus', () => {
    const s = freshGame(1, ['well']);
    res(s, 0, 0, 'wood');   // Feld 0: Holz — passt für den Brunnen
    res(s, 0, 1, 'wheat');  // Feld 1: Weizen — sperrt jede Lage über 0/1
    put(s, 0, 2, 'cottage');
    const pls = placements(s.players[0].board, catalog, ['well']);
    expect(pls.some((pl) => pl.cells.includes(0) && pl.cells.includes(1))).toBe(false);
    expect(pls.some((pl) => pl.cells.includes(2))).toBe(false);
    // Holz auf Feld 0 zählt als belegt, wenn die Lage es als Holz braucht
    const via0 = pls.filter((pl) => pl.cells.includes(0));
    expect(via0.length).toBeGreaterThan(0);
    for (const pl of via0) expect(pl.filled).toBe(1);
  });

  it('nimmt den Handelsposten als Joker, verlangt aber ein echtes Material', () => {
    const s = freshGame(1, ['well', 'trading_post']);
    put(s, 0, 0, 'trading_post');
    const pls = placements(s.players[0].board, catalog, ['well']);
    const via0 = pls.filter((pl) => pl.cells.includes(0));
    expect(via0.length).toBe(4); // 0+1 und 0+4, je in beiden Materialfolgen
    for (const pl of via0) {
      expect(pl.filled).toBe(1);
      expect(pl.missing).toHaveLength(1);
    }
  });
});

describe('Lernmodus: Platzierungs-Vorschlag', () => {
  it('schließt ein Muster ab, wenn nur noch ein Feld fehlt', () => {
    const s = inRound(solo(['well', 'cottage', 'farm', 'chapel', 'theater', 'tavern', 'factory']), 'stone');
    res(s, 0, 0, 'wood'); // Brunnen braucht nur noch Stein daneben
    const advice = suggestPlacement(s, 0, 'stone', catalog);
    expect(advice).not.toBeNull();
    expect(advice!.completes).toBe('well');
    expect([1, 4]).toContain(advice!.square);
    expect(advice!.have).toBe(advice!.need);
  });

  it('bevorzugt das wertvollere Muster, wenn zwei fertig würden', () => {
    const s = solo(['well', 'cottage', 'farm', 'chapel', 'theater', 'tavern', 'factory']);
    s.players[0].monument = { card: 'architects_guild', built: false };
    // Brunnen (Holz-Stein) wäre mit Feld 1 fertig …
    res(s, 0, 0, 'wood');
    const advice = suggestPlacement(s, 0, 'stone', catalog);
    expect(advice!.completes).toBe('well');
    expect(advice!.square).toBe(1);
  });

  it('arbeitet ohne Abschluss auf das nächstbeste Muster hin', () => {
    const s = solo(['well', 'cottage', 'farm', 'chapel', 'theater', 'tavern', 'factory']);
    const advice = suggestPlacement(s, 0, 'wheat', catalog);
    expect(advice).not.toBeNull();
    expect(advice!.completes).toBeUndefined();
    expect(advice!.towards).toBeTruthy();
    expect(advice!.have).toBeLessThan(advice!.need);
    expect(s.players[0].board[advice!.square].resource).toBeUndefined();
  });

  it('schweigt, wenn das Material in kein erreichbares Muster mehr passt', () => {
    // Nur der Brunnen (Holz+Stein) ist im Spiel — Glas hilft nirgends
    const s = solo(['well']);
    expect(suggestPlacement(s, 0, 'glass', catalog)).toBeNull();
  });

  it('schlägt nie ein belegtes Feld vor', () => {
    const s = solo(['farm', 'well', 'cottage', 'chapel', 'theater', 'tavern', 'factory']);
    for (const i of [0, 1, 2, 3, 4, 5]) res(s, 0, i, 'wheat');
    const advice = suggestPlacement(s, 0, 'wood', catalog);
    expect(advice).not.toBeNull();
    expect(s.players[0].board[advice!.square].resource).toBeUndefined();
    expect(s.players[0].board[advice!.square].building).toBeUndefined();
  });
});

describe('Lernmodus: Bau-Vorschlag', () => {
  it('erkennt ein fertiges Muster samt Feldern und Bauplatz', () => {
    const s = solo(['well', 'cottage', 'farm', 'chapel', 'theater', 'tavern', 'factory']);
    res(s, 0, 0, 'wood');
    res(s, 0, 1, 'stone');
    const advice = suggestBuild(s, 0, catalog);
    expect(advice).not.toBeNull();
    expect(advice!.card).toBe('well');
    expect(advice!.squares.sort()).toEqual([0, 1]);
    expect([0, 1]).toContain(advice!.target);
  });

  it('bevorzugt das Monument vor einem gleich fertigen Gebäude', () => {
    const s = solo(['well', 'cottage', 'farm', 'chapel', 'theater', 'tavern', 'factory']);
    s.players[0].monument = { card: 'obelisk_of_the_crescent', built: false };
    res(s, 0, 0, 'wood');
    res(s, 0, 1, 'stone');
    // Obelisk [[Weizen, ·, ·], [Ziegel, Glas, Ziegel]] in die unteren Reihen legen
    res(s, 0, 8, 'wheat');
    res(s, 0, 12, 'brick');
    res(s, 0, 13, 'glass');
    res(s, 0, 14, 'brick');
    const advice = suggestBuild(s, 0, catalog);
    expect(advice!.card).toBe('obelisk_of_the_crescent');
  });

  it('schweigt ohne fertiges Muster', () => {
    const s = solo(['well', 'cottage', 'farm', 'chapel', 'theater', 'tavern', 'factory']);
    res(s, 0, 0, 'wood');
    expect(suggestBuild(s, 0, catalog)).toBeNull();
  });

  it('schlägt den Bahnhof nur an der Strecke vor (unterste Reihe)', () => {
    const s = solo(['train_station', 'cottage', 'farm', 'chapel', 'theater', 'tavern', 'factory']);
    const pattern = catalog['train_station'].pattern.flat().filter((c) => c !== null);
    expect(pattern).toEqual(['stone', 'wood', 'stone']);
    // Oberste Reihe: Muster liegt, aber nicht an der Strecke → kein Vorschlag
    res(s, 0, 0, 'stone'); res(s, 0, 1, 'wood'); res(s, 0, 2, 'stone');
    expect(suggestBuild(s, 0, catalog)?.card).not.toBe('train_station');
    // Unterste Reihe: jetzt schon
    res(s, 0, 12, 'stone'); res(s, 0, 13, 'wood'); res(s, 0, 14, 'stone');
    const advice = suggestBuild(s, 0, catalog);
    expect(advice!.card).toBe('train_station');
    expect(advice!.target).toBeGreaterThanOrEqual(12);
  });

  it('schlägt keinen zweiten Bahnhof vor', () => {
    const s = solo(['train_station', 'cottage', 'farm', 'chapel', 'theater', 'tavern', 'factory']);
    put(s, 0, 15, 'train_station');
    res(s, 0, 12, 'stone'); res(s, 0, 13, 'wood'); res(s, 0, 14, 'stone');
    expect(suggestBuild(s, 0, catalog)).toBeNull();
  });
});
