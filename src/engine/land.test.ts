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

describe('Landpartie mit Erweiterungen und Eisenbahn', () => {
  it('buildGameConfig: Fortune, Tiny Trees, Rathaus und Eisenbahn gelten auch hier', async () => {
    const { buildGameConfig } = await import('../store/newGameConfig');
    const spieler = [
      { name: 'A', corner: 0 },
      { name: 'B', corner: 2 }
    ];
    const cfg = buildGameConfig(
      spieler, ['base', 'fortune', 'tiny_trees'], true, true,
      { land: true, townHall: true, train: true }
    );
    expect(cfg.land).toBe(true);
    expect(cfg.terrain?.length).toBeGreaterThan(0);
    expect(cfg.systems).toEqual({ coins: true, trees: true, cavern: true, train: true });
    expect(cfg.townHall).toBe(true);
    // 7 Kategorien + Bahnhof + 3 Anlieger
    expect(cfg.activeCards).toHaveLength(11);
    expect(cfg.activeCards).toContain('train_station');
    expect(cfg.activeCards.filter((id) => catalog[id].set === 'landpartie')).toHaveLength(3);
    // Erweiterungskarten sind wirklich im Topf: mindestens eine Auslage-Karte
    // darf aus Fortune oder Trees stammen — geprüft über die Sets im Config
    expect(cfg.sets).toEqual(['base', 'fortune', 'tiny_trees']);
  });

  it('Eisenbahn: die Landschaft lässt der Landpartie einen Platz für den Bahnhof', async () => {
    const { buildGameConfig } = await import('../store/newGameConfig');
    // Über viele Partien: der Bahnhof (Muster 1×3, unterste Reihe) ist baubar
    for (let i = 0; i < 40; i++) {
      const cfg = buildGameConfig(
        [{ name: 'A', corner: 0 }, { name: 'B', corner: 2 }],
        ['base'], true, false, { land: true, train: true }
      );
      const belegt = new Set(cfg.terrain!.map((c) => c.square));
      const frei = (row: number, col: number) => !belegt.has(at(row, col));
      let passt = false;
      for (let c = 0; c + 3 <= LAND_COLS; c++) {
        if (frei(5, c) && frei(5, c + 1) && frei(5, c + 2)) passt = true;
      }
      for (let c = 0; c < LAND_COLS; c++) {
        if (frei(5, c) && frei(4, c) && frei(3, c)) passt = true;
      }
      expect(passt).toBe(true);
    }
  });

  it('der Bahnhof lässt sich in der Landpartie an der Strecke bauen', () => {
    const cfg = config(1, undefined, false);
    cfg.land = true;
    cfg.systems.train = true;
    cfg.activeCards = [...cfg.activeCards, 'train_station'];
    // Fluss weit weg von der untersten Reihe, damit dort Platz ist
    cfg.terrain = [{ square: at(0, 0), kind: 'lake' }];
    const s = newGame(cfg);
    s.phase = { t: 'round', resource: 'wood' };
    // Muster des Bahnhofs: Stein, Holz, Stein — waagerecht in die letzte Reihe
    res(s, 0, at(5, 1), 'stone');
    res(s, 0, at(5, 2), 'wood');
    res(s, 0, at(5, 3), 'stone');
    const gebaut = apply(
      s,
      { t: 'build', player: 0, card: 'train_station', squares: [at(5, 1), at(5, 2), at(5, 3)], target: at(5, 2) },
      catalog
    );
    expect(gebaut.players[0].board[at(5, 2)].building?.card).toBe('train_station');
    // Gegenprobe: eine Reihe höher weist die Regel den Bahnhof ab
    const s2 = newGame(cfg);
    s2.phase = { t: 'round', resource: 'wood' };
    res(s2, 0, at(4, 1), 'stone');
    res(s2, 0, at(4, 2), 'wood');
    res(s2, 0, at(4, 3), 'stone');
    expect(() => apply(
      s2,
      { t: 'build', player: 0, card: 'train_station', squares: [at(4, 1), at(4, 2), at(4, 3)], target: at(4, 2) },
      catalog
    )).toThrowError('Der Bahnhof muss an der Strecke liegen (unterste Reihe)');
  });

  it('Caterinas Grotte legt keine Münze auf Landschaft', () => {
    // Eine Münze auf dem Fluss könnte niemand einsammeln — dort wird nie gebaut.
    const cfg = config(1, undefined, false);
    cfg.land = true;
    cfg.systems.coins = true;
    // Mittelfelder des 5×6-Bretts sind (2,2) und (3,2) — beide Fluss
    cfg.terrain = [
      { square: FLUSS_OBEN, kind: 'river' },
      { square: FLUSS_UNTEN, kind: 'river' }
    ];
    const s = newGame(cfg);
    s.phase = { t: 'round', resource: 'wood' };
    s.players[0].monument = { card: 'caterinas_grotto', built: false };
    // Muster der Grotte (2×4) oben links auslegen und dort bauen
    const felder: number[] = [];
    catalog['caterinas_grotto'].pattern.forEach((zeile, r) =>
      zeile.forEach((mat, c) => {
        if (!mat) return;
        res(s, 0, at(r, c), mat);
        felder.push(at(r, c));
      })
    );
    const nachher = apply(
      s,
      { t: 'build', player: 0, card: 'caterinas_grotto', squares: felder, target: felder[0] },
      catalog
    );
    expect(nachher.players[0].board[FLUSS_OBEN].coin).toBeUndefined();
    expect(nachher.players[0].board[FLUSS_UNTEN].coin).toBeUndefined();
    expect(nachher.players[0].coins).toBe(0);
  });
});
