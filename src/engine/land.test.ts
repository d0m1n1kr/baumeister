// Landpartie-Regeln: Landschaft ist unbebaubar, kostet keine Punkte und
// zählt nirgends als freies Feld.
import { describe, expect, it } from 'vitest';
import { apply, newGame } from './game';
import { scorePlayer } from './scoring';
import { catalog, config, put, res } from './test-helpers';
import { LAND_COLS } from './types';
import type { GameState } from './types';

const FELDER = 5 * 6;
/** Feld aus Zeile/Spalte — macht die Indizes im Test lesbar (5 Spalten!). */
const at = (row: number, col: number) => row * LAND_COLS + col;

/** Solo-Landpartie: 5×6 mit fester kleiner Landschaft für die Tests.
 *  Fluss senkrecht in Spalte 2, Berg unten links, See oben rechts. */
const FLUSS_OBEN = at(2, 2); // 12
const FLUSS_UNTEN = at(3, 2); // 17
const BERG = at(4, 0); // 20
const SEE = at(0, 4); // 4

function landGame(): GameState {
  const cfg = config(1, undefined, false);
  cfg.solo = true;
  cfg.land = true;
  cfg.terrain = [
    { square: FLUSS_OBEN, kind: 'river' },
    { square: FLUSS_UNTEN, kind: 'river' },
    { square: BERG, kind: 'mountain' },
    { square: SEE, kind: 'lake' }
  ];
  const s = newGame(cfg);
  s.phase = { t: 'round', resource: 'wood' };
  return s;
}

describe('Landpartie: Brett und Landschaft', () => {
  it('newGame legt die Landschaft aufs 5×6-Brett', () => {
    const s = landGame();
    expect(s.players[0].board).toHaveLength(FELDER);
    expect(FELDER).toBe(30);
    expect(s.players[0].board[FLUSS_OBEN].terrain).toBe('river');
    expect(s.players[0].board[BERG].terrain).toBe('mountain');
    expect(s.players[0].board[0].terrain).toBeUndefined();
  });

  it('Material darf nicht auf Landschaft', () => {
    const s = landGame();
    s.players[0].pending = 'wood';
    expect(() => apply(s, { t: 'placeResource', player: 0, square: FLUSS_OBEN }, catalog))
      .toThrowError('Feld ist belegt');
    // daneben geht es
    const ok = apply(s, { t: 'placeResource', player: 0, square: at(2, 3) }, catalog);
    expect(ok.players[0].board[at(2, 3)].resource).toBe('wood');
  });

  it('Material darf nicht AUF Landschaft verschoben werden', () => {
    const s = landGame();
    s.players[0].pending = 'wood';
    // moveResource verschiebt das zuletzt platzierte Material (placedSquare)
    const placed = apply(s, { t: 'placeResource', player: 0, square: at(2, 3) }, catalog);
    expect(() => apply(placed, { t: 'moveResource', player: 0, square: FLUSS_UNTEN }, catalog))
      .toThrowError('Feld ist belegt');
    const moved = apply(placed, { t: 'moveResource', player: 0, square: at(3, 3) }, catalog);
    expect(moved.players[0].board[at(3, 3)].resource).toBe('wood');
  });

  it('eine Auswahl mit Landschaftsfeld matcht nie ein Muster', () => {
    // Hütte: [[null, wheat], [brick, glass]] — der Winkel eines 2×2-Blocks.
    // Hier liegt seine untere rechte Ecke auf dem Fluss (2,2).
    const s = landGame();
    res(s, 0, at(1, 2), 'wheat');
    res(s, 0, at(2, 1), 'brick');
    expect(() =>
      apply(
        s,
        { t: 'build', player: 0, squares: [at(1, 2), at(2, 1), FLUSS_OBEN], card: 'cottage', target: at(1, 2) },
        catalog
      )
    ).toThrowError('Auswahl entspricht nicht dem Baumuster');
    // Gegenprobe: derselbe Winkel eine Zeile höher, ohne Landschaft
    const clean = landGame();
    res(clean, 0, at(0, 1), 'wheat');
    res(clean, 0, at(1, 0), 'brick');
    res(clean, 0, at(1, 1), 'glass');
    const built = apply(
      clean,
      { t: 'build', player: 0, squares: [at(0, 1), at(1, 0), at(1, 1)], card: 'cottage', target: at(1, 1) },
      catalog
    );
    expect(built.players[0].board[at(1, 1)].building?.card).toBe('cottage');
  });

  it('Leerfeld-Strafe ignoriert Landschaft', () => {
    const s = landGame();
    const score = scorePlayer(s, 0, catalog);
    // 30 Felder − 4 Landschaft = 26 leere; Landschaft kostet nichts
    expect(score.emptySquares).toBe(FELDER - 4);
    expect(score.emptyPenalty).toBe(-(FELDER - 4));
  });

  it('Stadt fertig: Landschaft zählt nicht als freies Feld', () => {
    const s = landGame();
    for (let i = 0; i < FELDER; i++) {
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
    cfg.terrain = [{ square: FLUSS_OBEN, kind: 'river' }];
    const s = newGame(cfg);
    s.phase = { t: 'round', resource: 'wood' };
    expect((catalog['shed'].effects ?? []).includes('buildAnywhereSelf')).toBe(true);
    res(s, 0, 0, 'wood');
    res(s, 0, 1, 'stone');
    expect(() =>
      apply(s, { t: 'build', player: 0, squares: [0, 1], card: 'shed', target: FLUSS_OBEN }, catalog)
    ).toThrowError('Bauplatz ist nicht frei');
    // auf ein normales freies Feld geht es
    const ziel = at(4, 4);
    const ok = apply(s, { t: 'build', player: 0, squares: [0, 1], card: 'shed', target: ziel }, catalog);
    expect(ok.players[0].board[ziel].building?.card).toBe('shed');
  });
});

describe('Landpartie: Wertung bleibt schnell', () => {
  it('volles 5×6 mit vielen Hütten und Bauernhöfen wertet unter 200 ms', () => {
    const cfg = config(1, undefined, false);
    cfg.solo = true;
    cfg.land = true;
    cfg.terrain = [
      { square: FLUSS_OBEN, kind: 'river' }, { square: FLUSS_UNTEN, kind: 'river' },
      { square: BERG, kind: 'mountain' }, { square: SEE, kind: 'lake' }
    ];
    const s = newGame(cfg);
    // Schlimmster Fall für den Fütterungs-Resolver: viele Hütten, mehrere Farmen
    let i = 0;
    for (let sq = 0; sq < FELDER; sq++) {
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
    // Erzmine mittig auf (1,2); ihre vier Nachbarn sind (0,2), (2,2), (1,1), (1,3)
    const mine = at(1, 2);
    cfg.terrain = [
      { square: at(0, 2), kind: 'mountain' },
      { square: at(1, 1), kind: 'mountain' },
      { square: at(1, 3), kind: 'lake' }
    ];
    const s = newGame(cfg);
    put(s, 0, mine, 'ore_mine');
    const score = scorePlayer(s, 0, catalog);
    const line = score.lines.find((l) => l.card === 'ore_mine')!;
    expect(line.points).toBe(6); // 2 Berge × 3, der See zählt nicht
  });

  it('ifAdjacentTerrain: einmal daneben genügt, weit weg gibt nichts', () => {
    const cfg = config(1, undefined, false);
    cfg.solo = true;
    cfg.land = true;
    // See oben rechts, Fluss ganz unten links — bewusst weit auseinander
    cfg.terrain = [{ square: at(0, 4), kind: 'lake' }, { square: at(5, 0), kind: 'river' }];
    const s = newGame(cfg);
    put(s, 0, at(1, 4), 'boathouse'); // direkt unter dem See
    put(s, 0, at(2, 2), 'watermill'); // grenzt an nichts Passendes
    const score = scorePlayer(s, 0, catalog);
    expect(score.lines.find((l) => l.card === 'boathouse')!.points).toBe(3);
    expect(score.lines.find((l) => l.card === 'watermill')!.points).toBe(0);
  });
});

describe('Landpartie mit mehreren Spielern', () => {
  it('alle bekommen dasselbe 5×6-Brett mit derselben Landschaft', () => {
    // Fairness: Wer eine andere Landschaft hätte, spielte ein anderes Spiel.
    const cfg = config(4, undefined, false);
    cfg.land = true;
    cfg.terrain = [
      { square: FLUSS_OBEN, kind: 'river' },
      { square: FLUSS_UNTEN, kind: 'river' },
      { square: BERG, kind: 'mountain' },
      { square: SEE, kind: 'lake' }
    ];
    const s = newGame(cfg);
    expect(s.players).toHaveLength(4);
    const ersteLandschaft = s.players[0].board.map((sq) => sq.terrain ?? null);
    for (const p of s.players) {
      expect(p.board).toHaveLength(FELDER);
      expect(p.board.map((sq) => sq.terrain ?? null)).toEqual(ersteLandschaft);
    }
    // und die Landschaft steht wirklich auf jedem Brett, nicht nur beim Ersten
    expect(s.players[3].board[BERG].terrain).toBe('mountain');
  });

  it('die Landschaft sperrt auch bei Mitspielern das Bauen', () => {
    const cfg = config(2, undefined, false);
    cfg.land = true;
    cfg.terrain = [{ square: FLUSS_OBEN, kind: 'river' }];
    const s = newGame(cfg);
    s.phase = { t: 'round', resource: 'wood' };
    s.players[1].pending = 'wood';
    expect(() => apply(s, { t: 'placeResource', player: 1, square: FLUSS_OBEN }, catalog))
      .toThrowError('Feld ist belegt');
  });

  it('buildGameConfig erlaubt die Landpartie auch ohne Solo', async () => {
    const { buildGameConfig } = await import('../store/newGameConfig');
    const spieler = [
      { name: 'A', corner: 0 },
      { name: 'B', corner: 2 }
    ];
    const cfg = buildGameConfig(spieler, ['base'], true, false, { land: true });
    expect(cfg.land).toBe(true);
    expect(cfg.terrain?.length).toBeGreaterThan(0);
    expect(cfg.activeCards).toHaveLength(10); // 7 + 3 Anlieger
    // Gegenprobe: ohne das Flag bleibt es klassisch
    const klassisch = buildGameConfig(spieler, ['base'], true, false, {});
    expect(klassisch.land).toBeUndefined();
    expect(klassisch.terrain).toBeUndefined();
  });
});
