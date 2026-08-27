// Landpartie-Regeln: Landschaft ist unbebaubar, kostet keine Punkte und
// zählt nirgends als freies Feld.
import { describe, expect, it } from 'vitest';
import { apply, newGame } from './game';
import { scorePlayer } from './scoring';
import { catalog, config, put, res } from './test-helpers';
import { generateTerrain } from './terrain';
import { mulberry32 } from './registry';
import { LAND_COLS, isFreeSquare, neighbors4 } from './types';
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

/** Solo-Landpartie mit frei gesetzter Landschaft — für die Wertungs-Tests. */
function landCfg(terrain: { square: number; kind: 'river' | 'mountain' | 'lake' }[]) {
  const cfg = config(1, undefined, false);
  cfg.solo = true;
  cfg.land = true;
  cfg.terrain = terrain;
  return cfg;
}

const punkte = (s: GameState, card: string) =>
  scorePlayer(s, 0, catalog).lines.find((l) => l.card === card)?.points ?? 0;

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

  it('Fischerhütte: 1 Punkt je See-Feld, andere Landschaft zählt nicht', () => {
    const cfg = landCfg([
      { square: at(0, 2), kind: 'lake' },
      { square: at(1, 1), kind: 'lake' },
      { square: at(1, 3), kind: 'mountain' }
    ]);
    const s = newGame(cfg);
    put(s, 0, at(1, 2), 'fishermans_hut'); // 2 Seen + 1 Berg als Nachbarn
    expect(punkte(s, 'fishermans_hut')).toBe(2);
  });

  it('Erzmine: 2 Punkte je Berg-Feld', () => {
    const cfg = landCfg([
      { square: at(0, 2), kind: 'mountain' },
      { square: at(1, 1), kind: 'mountain' },
      { square: at(1, 3), kind: 'lake' }
    ]);
    const s = newGame(cfg);
    put(s, 0, at(1, 2), 'ore_mine');
    expect(punkte(s, 'ore_mine')).toBe(4); // 2 Berge × 2, der See zählt nicht
  });

  it('Bootshaus staffelt sich — aber nur die am Wasser zählen mit', () => {
    // Der Wunsch dahinter: mehrere Bootshäuser sollen sich lohnen, wie die
    // Taverne. Fluss senkrecht in Spalte 2, also liegt Spalte 1 am Wasser.
    const cfg = landCfg([0, 1, 2, 3, 4, 5].map((r) => ({ square: at(r, 2), kind: 'river' as const })));
    const stufen = [1, 2, 3, 4, 5].map((k) => {
      const s = newGame(cfg);
      for (let i = 0; i < k; i++) put(s, 0, at(i, 1), 'boathouse');
      return punkte(s, 'boathouse');
    });
    expect(stufen).toEqual([1, 3, 6, 10, 14]);

    // Eines abseits des Wassers bringt die Staffel nicht weiter
    const s = newGame(cfg);
    put(s, 0, at(0, 1), 'boathouse'); // am Fluss
    put(s, 0, at(5, 4), 'boathouse'); // trocken
    expect(punkte(s, 'boathouse')).toBe(1);
  });

  it('Wassermühle: zählt rote Nachbarn — aber nur am Fluss', () => {
    const cfg = landCfg([{ square: at(2, 1), kind: 'river' }]);
    const amFluss = newGame(cfg);
    put(amFluss, 0, at(2, 2), 'watermill');
    put(amFluss, 0, at(1, 2), 'farm');    // rot
    put(amFluss, 0, at(3, 2), 'orchard'); // rot
    put(amFluss, 0, at(2, 3), 'well');    // grau, zählt nicht
    expect(punkte(amFluss, 'watermill')).toBe(4);

    // Dieselbe Nachbarschaft ohne Fluss daneben: die Mühle mahlt nicht
    const trocken = newGame(cfg);
    put(trocken, 0, at(4, 2), 'watermill');
    put(trocken, 0, at(3, 2), 'farm');
    put(trocken, 0, at(5, 2), 'orchard');
    expect(punkte(trocken, 'watermill')).toBe(0);
  });

  it('Fähranleger: Fluss-Felder in Zeile und Spalte, nicht die Nachbarschaft', () => {
    // Fluss waagerecht durch Zeile 3 (5 Felder) und ein Stück in Spalte 0
    const cfg = landCfg([
      ...[0, 1, 2, 3, 4].map((c) => ({ square: at(3, c), kind: 'river' as const })),
      { square: at(4, 0), kind: 'river' as const }
    ]);
    const s = newGame(cfg);
    put(s, 0, at(1, 0), 'ferry'); // Spalte 0 trifft 2 Fluss-Felder, Zeile 1 keines
    expect(punkte(s, 'ferry')).toBe(2);

    // Weit weg von jeder Fluss-Linie: nichts — Nachbarschaft hilft hier nicht
    const s2 = newGame(cfg);
    put(s2, 0, at(0, 2), 'ferry'); // Spalte 2 trifft Zeile 3 → 1 Feld
    expect(punkte(s2, 'ferry')).toBe(1);
  });

  it('Berghütte: 3 Punkte, solange sie in Zeile und Spalte allein steht', () => {
    const cfg = landCfg([{ square: at(0, 0), kind: 'mountain' }]);
    const allein = newGame(cfg);
    put(allein, 0, at(1, 1), 'alpine_hut');
    expect(punkte(allein, 'alpine_hut')).toBe(3);

    // Zwei versetzt (verschiedene Zeile UND Spalte): beide zählen
    const versetzt = newGame(cfg);
    put(versetzt, 0, at(1, 1), 'alpine_hut');
    put(versetzt, 0, at(3, 3), 'alpine_hut');
    expect(punkte(versetzt, 'alpine_hut')).toBe(6);

    // Zwei in derselben Spalte: keine von beiden zählt
    const gereiht = newGame(cfg);
    put(gereiht, 0, at(1, 1), 'alpine_hut');
    put(gereiht, 0, at(4, 1), 'alpine_hut');
    expect(punkte(gereiht, 'alpine_hut')).toBe(0);
  });

  it('Obergrenzen: eine Kopie bleibt im Band des Basisspiels', () => {
    // Wachhund gegen Powerkreep. Gemessen wird in ECHTEN Landschaften (nicht in
    // konstruierten Extremen): jede freie Position, bestes Ergebnis. Bezug ist
    // das Basisspiel — 2 Zellen bringen dort 1–2 Punkte (Schuppen, Brunnen,
    // Springbrunnen), 3 Zellen 2–4 (Taverne, Gasthaus, Tempel).
    const GRENZEN: Record<string, number> = {
      fishermans_hut: 2,
      boathouse: 1, // allein am Wasser; die Staffel kommt erst mit mehreren
      ore_mine: 4,
      watermill: 6, // nur mit drei roten Nachbarn — 12 Zellen Vorarbeit
      ferry: 5,
      alpine_hut: 3
    };
    for (const [card, grenze] of Object.entries(GRENZEN)) {
      let best = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const cfg = landCfg(generateTerrain(mulberry32(seed)));
        cfg.activeCards = [...cfg.activeCards, card];
        const leer = newGame(cfg);
        for (let sq = 0; sq < FELDER; sq++) {
          if (!isFreeSquare(leer.players[0].board[sq])) continue;
          const s2 = newGame(cfg);
          s2.players[0].board[sq].building = { card };
          if (card === 'watermill') {
            // Beste Lage für die Mühle: alle freien Nachbarn mit Nahrung besetzt
            for (const nb of neighbors4(sq, LAND_COLS, 6)) {
              if (isFreeSquare(s2.players[0].board[nb])) {
                s2.players[0].board[nb].building = { card: 'farm' };
              }
            }
          }
          best = Math.max(best, punkte(s2, card));
        }
      }
      expect({ card, best }).toEqual({ card, best: Math.min(best, grenze) });
    }
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
