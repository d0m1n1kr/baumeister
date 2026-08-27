// Landpartie-Regeln: Landschaft ist unbebaubar, kostet keine Punkte und
// zählt nirgends als freies Feld.
import { describe, expect, it } from 'vitest';
import { apply, newGame } from './game';
import { scorePlayer } from './scoring';
import { catalog, config, put, res } from './test-helpers';
import type { GameState } from './types';

/** Solo-Landpartie: 6×6 mit fester kleiner Landschaft für die Tests. */
function landGame(): GameState {
  const cfg = config(1, undefined, false);
  cfg.solo = true;
  cfg.land = true;
  cfg.terrain = [
    { square: 14, kind: 'river' },
    { square: 15, kind: 'river' },
    { square: 21, kind: 'mountain' },
    { square: 28, kind: 'lake' }
  ];
  const s = newGame(cfg);
  s.phase = { t: 'round', resource: 'wood' };
  return s;
}

describe('Landpartie: Brett und Landschaft', () => {
  it('newGame legt die Landschaft aufs 36er-Brett', () => {
    const s = landGame();
    expect(s.players[0].board).toHaveLength(36);
    expect(s.players[0].board[14].terrain).toBe('river');
    expect(s.players[0].board[21].terrain).toBe('mountain');
    expect(s.players[0].board[0].terrain).toBeUndefined();
  });

  it('Material darf nicht auf Landschaft', () => {
    const s = landGame();
    s.players[0].pending = 'wood';
    expect(() => apply(s, { t: 'placeResource', player: 0, square: 14 }, catalog))
      .toThrowError('Feld ist belegt');
    // daneben geht es
    const ok = apply(s, { t: 'placeResource', player: 0, square: 13 }, catalog);
    expect(ok.players[0].board[13].resource).toBe('wood');
  });

  it('Material darf nicht AUF Landschaft verschoben werden', () => {
    const s = landGame();
    s.players[0].pending = 'wood';
    // moveResource verschiebt das zuletzt platzierte Material (placedSquare)
    const placed = apply(s, { t: 'placeResource', player: 0, square: 13 }, catalog);
    expect(() => apply(placed, { t: 'moveResource', player: 0, square: 15 }, catalog))
      .toThrowError('Feld ist belegt');
    const moved = apply(placed, { t: 'moveResource', player: 0, square: 20 }, catalog);
    expect(moved.players[0].board[20].resource).toBe('wood');
  });

  it('eine Auswahl mit Landschaftsfeld matcht nie ein Muster', () => {
    // Hütte: [[null, wheat], [brick, glass]]. Auf 6×6 liegt der Block
    // 8/13/14 vertikal-benachbart (8=(1,2), 13=(2,1), 14=(2,2)) — 14 ist Fluss.
    const s = landGame();
    res(s, 0, 8, 'wheat');
    res(s, 0, 13, 'brick');
    // Auswahl mit dem Terrainfeld 14: kein Material darauf → Muster passt nie
    expect(() =>
      apply(s, { t: 'build', player: 0, squares: [8, 13, 14], card: 'cottage', target: 8 }, catalog)
    ).toThrowError('Auswahl entspricht nicht dem Baumuster');
    // Zur Gegenprobe derselbe Winkel ohne Terrain: 2=(0,2), 7=(1,1), 8=(1,2)
    const clean = landGame();
    res(clean, 0, 2, 'wheat');
    res(clean, 0, 7, 'brick');
    res(clean, 0, 8, 'glass');
    const built = apply(
      clean, { t: 'build', player: 0, squares: [2, 7, 8], card: 'cottage', target: 8 }, catalog
    );
    expect(built.players[0].board[8].building?.card).toBe('cottage');
  });

  it('Leerfeld-Strafe ignoriert Landschaft', () => {
    const s = landGame();
    const score = scorePlayer(s, 0, catalog);
    // 36 Felder − 4 Landschaft = 32 leere; Landschaft kostet nichts
    expect(score.emptySquares).toBe(32);
    expect(score.emptyPenalty).toBe(-32);
  });

  it('Stadt fertig: Landschaft zählt nicht als freies Feld', () => {
    const s = landGame();
    for (let i = 0; i < 36; i++) {
      if (!s.players[0].board[i].terrain) put(s, 0, i, 'cottage');
    }
    const done = apply(s, { t: 'declareComplete', player: 0 }, catalog);
    expect(done.players[0].done).toBe(true);
    expect(done.phase.t).toBe('gameOver');
  });

  it('buildAnywhere darf nicht auf Landschaft zielen', () => {
    // Schuppen ([wood, stone], buildAnywhereSelf) muss in der Auslage sein
    const cfg = config(1, ['cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'shed'], false);
    cfg.solo = true;
    cfg.land = true;
    cfg.terrain = [{ square: 14, kind: 'river' }];
    const s = newGame(cfg);
    s.phase = { t: 'round', resource: 'wood' };
    expect((catalog['shed'].effects ?? []).includes('buildAnywhereSelf')).toBe(true);
    res(s, 0, 0, 'wood');
    res(s, 0, 1, 'stone');
    expect(() =>
      apply(s, { t: 'build', player: 0, squares: [0, 1], card: 'shed', target: 14 }, catalog)
    ).toThrowError('Bauplatz ist nicht frei');
    // auf ein normales freies Feld geht es
    const ok = apply(s, { t: 'build', player: 0, squares: [0, 1], card: 'shed', target: 20 }, catalog);
    expect(ok.players[0].board[20].building?.card).toBe('shed');
  });
});

describe('Landpartie: Wertung bleibt schnell', () => {
  it('volles 6×6 mit vielen Hütten und Bauernhöfen wertet unter 200 ms', () => {
    const cfg = config(1, undefined, false);
    cfg.solo = true;
    cfg.land = true;
    cfg.terrain = [
      { square: 14, kind: 'river' }, { square: 15, kind: 'river' },
      { square: 21, kind: 'mountain' }, { square: 28, kind: 'lake' }
    ];
    const s = newGame(cfg);
    // Schlimmster Fall für den Fütterungs-Resolver: viele Hütten, mehrere Farmen
    let i = 0;
    for (let sq = 0; sq < 36; sq++) {
      if (s.players[0].board[sq].terrain) continue;
      put(s, 0, sq, i % 4 === 3 ? 'farm' : 'cottage');
      i++;
    }
    const t0 = performance.now();
    const score = scorePlayer(s, 0, catalog);
    const dauer = performance.now() - t0;
    expect(score.total).toBeGreaterThan(0);
    expect(dauer).toBeLessThan(200);
  });
});

describe('Landpartie: Setup und Wertungs-Bausteine', () => {
  it('randomSetup mit land: 10 Karten (7 + 3 Anlieger), Terrain im Config', async () => {
    const { dailySeed, mulberry32, randomSetup } = await import('./registry');
    const cfg = randomSetup(
      catalog, [{ name: 'Solo', corner: 0 }], true,
      mulberry32(dailySeed('2026-08-27', 'land-')), ['base'], {}, true, false, false, true
    );
    expect(cfg.land).toBe(true);
    expect(cfg.activeCards).toHaveLength(10);
    const landCards = cfg.activeCards.filter((id) => catalog[id].set === 'landpartie');
    expect(landCards).toHaveLength(3);
    expect(cfg.terrain!.length).toBeGreaterThanOrEqual(9);
    // deterministisch
    const again = randomSetup(
      catalog, [{ name: 'Solo', corner: 0 }], true,
      mulberry32(dailySeed('2026-08-27', 'land-')), ['base'], {}, true, false, false, true
    );
    expect(again.activeCards).toEqual(cfg.activeCards);
    expect(again.terrain).toEqual(cfg.terrain);
  });

  it('ohne land landet keine Anlieger-Karte in der Auslage', async () => {
    const { dailySeed, mulberry32, randomSetup } = await import('./registry');
    const cfg = randomSetup(
      catalog, [{ name: 'Solo', corner: 0 }], true,
      mulberry32(dailySeed('2026-08-27')), ['base'], {}, true
    );
    expect(cfg.activeCards.some((id) => catalog[id].set === 'landpartie')).toBe(false);
    expect(cfg.terrain).toBeUndefined();
  });

  it('Landpartie- und Klassik-Seed desselben Tages unterscheiden sich', async () => {
    const { dailySeed } = await import('./registry');
    expect(dailySeed('2026-08-27', 'land-')).not.toBe(dailySeed('2026-08-27'));
  });

  it('perAdjacentTerrain zählt nur die genannten Arten', () => {
    const cfg = config(1, undefined, false);
    cfg.solo = true;
    cfg.land = true;
    // Erzmine auf Feld 8: Nachbarn 2 (oben), 7 (links), 9 (rechts), 14 (unten)
    cfg.terrain = [
      { square: 2, kind: 'mountain' },
      { square: 7, kind: 'mountain' },
      { square: 9, kind: 'lake' }
    ];
    const s = newGame(cfg);
    put(s, 0, 8, 'ore_mine');
    const score = scorePlayer(s, 0, catalog);
    const line = score.lines.find((l) => l.card === 'ore_mine')!;
    expect(line.points).toBe(6); // 2 Berge × 3, der See zählt nicht
  });

  it('ifAdjacentTerrain: einmal daneben genügt, weit weg gibt nichts', () => {
    const cfg = config(1, undefined, false);
    cfg.solo = true;
    cfg.land = true;
    cfg.terrain = [{ square: 9, kind: 'lake' }, { square: 30, kind: 'river' }];
    const s = newGame(cfg);
    put(s, 0, 8, 'boathouse');   // grenzt an den See (9)
    put(s, 0, 5, 'watermill');   // grenzt an nichts Passendes
    const score = scorePlayer(s, 0, catalog);
    expect(score.lines.find((l) => l.card === 'boathouse')!.points).toBe(3);
    expect(score.lines.find((l) => l.card === 'watermill')!.points).toBe(0);
  });
});
