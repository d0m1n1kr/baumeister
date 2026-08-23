import { describe, it, expect } from 'vitest';
import { apply, newGame, RuleError } from './game';
import { scorePlayer } from './scoring';
import { catalog, config, freshGame, inRound, put, res, ACTIVE_DEFAULT } from './test-helpers';
import { mulberry32, randomSetup } from './registry';
import type { GameState } from './types';

const a = (s: GameState, action: Parameters<typeof apply>[1]) => apply(s, action, catalog);

const FORTUNE_ACTIVE = ['cottage', 'farm', 'mine', 'parsonage', 'jeweler', 'gamblers_den', 'oddity_shop'];

function coinGame(n = 2, active: string[] = FORTUNE_ACTIVE): GameState {
  return freshGame(n, active, false, undefined, { coins: true });
}

describe('Set-Auswahl', () => {
  const players = [{ name: 'A', corner: 0 }, { name: 'B', corner: 1 }];

  it('ohne Fortune-Set keine Fortune-Karten im Pool', () => {
    for (let seed = 0; seed < 20; seed++) {
      const cfg = randomSetup(catalog, players, true, mulberry32(seed));
      for (const id of [...cfg.activeCards, ...cfg.monumentDeals.flat()]) {
        expect(catalog[id].set, id).toBe('base');
      }
    }
  });

  it('mit Fortune-Set mischen sich Fortune-Karten in die Pools', () => {
    let sawFortune = false;
    for (let seed = 0; seed < 30 && !sawFortune; seed++) {
      const cfg = randomSetup(catalog, players, true, mulberry32(seed), ['base', 'fortune'], { coins: true });
      sawFortune = [...cfg.activeCards, ...cfg.monumentDeals.flat()].some(
        (id) => catalog[id].set === 'fortune'
      );
      expect(cfg.systems.coins).toBe(true);
    }
    expect(sawFortune).toBe(true);
  });
});

describe('Münz-Kernsystem', () => {
  it('2+ Bauten in einer Runde → 1 Münze am Rundenende', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'factory']));
    for (const p of s.players) p.pending = null;
    res(s, 0, 0, 'wood'); res(s, 0, 1, 'stone');
    res(s, 0, 4, 'wood'); res(s, 0, 5, 'stone');
    res(s, 1, 0, 'wood'); res(s, 1, 1, 'stone');
    s = a(s, { t: 'build', player: 0, squares: [0, 1], card: 'well', target: 0 });
    s = a(s, { t: 'build', player: 0, squares: [4, 5], card: 'well', target: 4 });
    s = a(s, { t: 'build', player: 1, squares: [0, 1], card: 'well', target: 0 }); // nur 1 Bau
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'roundDone', player: 1 });
    expect(s.players[0].coins).toBe(1);
    expect(s.players[1].coins).toBe(0);
  });

  it('Truhe ist auf 4 Münzen begrenzt', () => {
    const s = coinGame();
    s.players[0].coins = 4;
    const s2 = inRound(s);
    res(s2, 0, 0, 'wood'); res(s2, 0, 1, 'stone');
    s2.players[0].pending = null;
    const s3 = a(s2, { t: 'build', player: 0, squares: [0, 1], card: 'mine', target: 0 });
    expect(s3.players[0].coins).toBe(4);
  });

  it('Münztausch: 1 Münze → beliebiges anderes Material (nicht für den Baumeister)', () => {
    let s = coinGame();
    s.players[1].coins = 1;
    s = a(s, { t: 'nameResource', resource: 'wood' }); // MB = P0
    expect(() => a(s, { t: 'coinSwap', player: 0, take: 'glass' })).toThrow(RuleError);
    s = a(s, { t: 'coinSwap', player: 1, take: 'glass' });
    expect(s.players[1].pending).toBe('glass');
    expect(s.players[1].coins).toBe(0);
    // ohne Münze kein Tausch
    expect(() => a(s, { t: 'coinSwap', player: 1, take: 'stone' })).toThrow(RuleError);
  });

  it('Endwertung: 1 Punkt je Münze (2 mit Estival-Festival)', () => {
    const s = coinGame();
    s.players[0].coins = 3;
    const score = scorePlayer(s, 0, catalog);
    expect(score.coins).toEqual({ count: 3, spent: 0, points: 3 });

    put(s, 0, 0, 'estival_festival');
    expect(scorePlayer(s, 0, catalog).coins?.points).toBe(6);
  });
});

describe('Fortune-Gebäude', () => {
  function buildOn(s: GameState, player: number, card: string): GameState {
    // baut die Karte über eine Mine-große Fläche — nutzt das echte Muster der Karte
    const def = catalog[card];
    const cells: number[] = [];
    def.pattern.forEach((row, r) =>
      row.forEach((c, cIdx) => {
        if (c) {
          const sq = r * 4 + cIdx;
          res(s, player, sq, c);
          cells.push(sq);
        }
      })
    );
    return a(s, { t: 'build', player, squares: cells, card, target: cells[0] });
  }

  it('Mine: +1 Münze beim Bau', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s = buildOn(s, 0, 'mine');
    expect(s.players[0].coins).toBe(1);
  });

  it('Statue: +1 Münze je Typ mit 3+ Exemplaren', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'statue', 'chapel', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    for (const sq of [12, 13, 14]) put(s, 0, sq, 'cottage');
    s = buildOn(s, 0, 'statue');
    expect(s.players[0].coins).toBe(1);
  });

  it('Spielhölle: +2 Münzen bei genau 1 Münze', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s.players[0].coins = 1;
    s = buildOn(s, 0, 'gamblers_den');
    expect(s.players[0].coins).toBe(3);
  });

  it('Juwelier: ohne Münze erhalten alle anderen 1 Münze', () => {
    let s = inRound(coinGame(3));
    s.players[0].pending = null;
    s = buildOn(s, 0, 'jeweler');
    expect(s.players[0].coins).toBe(0);
    expect(s.players[1].coins).toBe(1);
    expect(s.players[2].coins).toBe(1);
  });

  it('Pfarrhaus: Münzen ≠ Hüttenzahl → alle Münzen weg', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s.players[0].coins = 2;
    put(s, 0, 15, 'cottage'); // 1 Hütte, 2 Münzen → Verlust
    s = buildOn(s, 0, 'parsonage');
    expect(s.players[0].coins).toBe(0);
  });

  it('Estival-Festival: Bau kostet 2 Münzen', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    expect(() => buildOn(s, 0, 'estival_festival')).toThrow(RuleError);
    s.players[0].coins = 2;
    s.players[0].monument = { card: 'estival_festival', built: false };
    s = buildOn(s, 0, 'estival_festival');
    expect(s.players[0].coins).toBe(0);
  });

  it('Steinmetzgilde: je 1 Münze ein unterschiedliches Gebäude', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s.players[0].coins = 2;
    s.players[0].monument = { card: 'masons_guild', built: false };
    s = buildOn(s, 0, 'masons_guild');
    expect(s.players[0].choices[0]?.t).toBe('masonsGuild');
    s = a(s, { t: 'resolveMasons', player: 0, card: 'mine', square: 15 });
    expect(s.players[0].board[15].building?.card).toBe('mine');
    expect(() => a(s, { t: 'resolveMasons', player: 0, card: 'mine', square: 14 })).toThrow(RuleError);
    s = a(s, { t: 'resolveMasons', player: 0, card: 'farm', square: 14 });
    expect(s.players[0].coins).toBe(0);
    expect(s.players[0].choices.length).toBe(0);
  });

  it('Kuriositätenladen: ablegen und als Baumeister nehmen', () => {
    let s = coinGame();
    put(s, 1, 15, 'oddity_shop');
    s = a(s, { t: 'nameResource', resource: 'wood' }); // MB = P0
    s = a(s, { t: 'oddityStore', player: 1, square: 15 });
    expect(s.players[1].board[15].building?.stored).toEqual(['wood']);
    expect(s.players[1].pending).toBeNull();
    // Runde beenden → P1 wird MB und nimmt das Material
    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'roundDone', player: 1 });
    expect(s.masterBuilder).toBe(1);
    // aus dem EIGENEN Laden darf der Baumeister nicht nehmen
    expect(() =>
      a(s, { t: 'oddityTake', player: 1, fromPlayer: 1, fromSquare: 15, targetSquare: 0 })
    ).toThrow(RuleError);
  });

  it('Kuriositätenladen: Baumeister-Zugriff gibt dem Besitzer 1 Münze', () => {
    let s = coinGame();
    put(s, 1, 15, 'oddity_shop', { stored: ['glass'] });
    s.masterBuilder = 0;
    s = a(s, { t: 'oddityTake', player: 0, fromPlayer: 1, fromSquare: 15, targetSquare: 3 });
    expect(s.players[0].board[3].resource).toBe('glass');
    expect(s.players[1].coins).toBe(1);
    expect(s.players[1].board[15].building?.stored).toEqual([]);
    expect(() =>
      a(s, { t: 'oddityTake', player: 0, fromPlayer: 1, fromSquare: 15, targetSquare: 4 })
    ).toThrow(RuleError);
  });

  it('Museum: einlagern und 1×/Runde verkaufen', () => {
    let s = inRound(coinGame(), 'wood');
    put(s, 0, 15, 'museum');
    s = a(s, { t: 'warehouseStore', player: 0, square: 15 });
    expect(s.players[0].board[15].building?.stored).toEqual(['wood']);
    s = a(s, { t: 'museumSell', player: 0, square: 15, storedIndex: 0 });
    expect(s.players[0].coins).toBe(1);
    expect(() => a(s, { t: 'museumSell', player: 0, square: 15, storedIndex: 0 })).toThrow(RuleError);
  });

  it('Kathedrale (Fortune): ohne 3 Münzen wird eine Hütte gebaut', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'well', 'cathedral_fortune', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    s = buildOn(s, 0, 'cathedral_fortune');
    const built = s.players[0].board.find((sq) => sq.building);
    expect(built?.building?.card).toBe('cottage');
  });

  it('Prismenschmiede: Bauen ohne Materialentfernen, 1×/Runde', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    put(s, 0, 15, 'prism_forge');
    res(s, 0, 0, 'wood');
    res(s, 0, 1, 'stone');
    s = a(s, { t: 'build', player: 0, squares: [0, 1], card: 'well', target: 0, prism: true });
    // Materialien liegen noch — aber Feld 0 ist jetzt bebaut; zweiter Bau auf Feld 1 unmöglich,
    // also prüfen wir nur, dass Material 1 erhalten blieb und die Nutzung gesperrt ist
    expect(s.players[0].board[1].resource).toBe('stone');
    expect(s.players[0].prismUsedThisRound).toBe(true);
    expect(() =>
      a(s, { t: 'build', player: 0, squares: [1], card: 'well', target: 1, prism: true })
    ).toThrow(RuleError);
  });

  it('Südliches Semaphor: 1 Zusatz-Material, nicht tauschbar', () => {
    let s = coinGame();
    put(s, 0, 15, 'southern_semaphore');
    s.players[0].coins = 2;
    s.masterBuilder = 1;
    s = a(s, { t: 'nameResource', resource: 'wood' });
    expect(s.players[0].pendingExtra).toBe('wood');
    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    expect(s.players[0].pending).toBe('wood'); // Zusatz-Material rückt nach
    expect(s.players[0].pendingLocked).toBe(true);
    expect(() => a(s, { t: 'coinSwap', player: 0, take: 'glass' })).toThrow(RuleError);
    s = a(s, { t: 'placeResource', player: 0, square: 1 });
    expect(s.players[0].pending).toBeNull();
  });
});

describe('Fortune-Wertungen', () => {
  it('Schulhaus: 2 + 2 bei Münzen ≥ rechter Nachbar', () => {
    const s = coinGame();
    put(s, 0, 0, 'schoolhouse');
    put(s, 0, 1, 'cottage');
    put(s, 0, 15, 'farm');
    s.players[0].coins = 2;
    s.players[1].coins = 3; // rechter Nachbar von P0 ist P1
    let score = scorePlayer(s, 0, catalog);
    expect(score.lines.find((l) => l.card === 'schoolhouse')?.points).toBe(2);
    s.players[0].coins = 3;
    score = scorePlayer(s, 0, catalog);
    expect(score.lines.find((l) => l.card === 'schoolhouse')?.points).toBe(4);
  });

  it('Weingut Eraflage: 8 − 2 je Typ in Zeile/Spalte', () => {
    const s = coinGame();
    put(s, 0, 5, 'eraflage_vineyard');
    put(s, 0, 4, 'cottage');
    put(s, 0, 6, 'well');
    put(s, 0, 13, 'well'); // gleiche Spalte, gleicher Typ → zählt nur 1×
    const score = scorePlayer(s, 0, catalog);
    expect(score.lines.find((l) => l.card === 'eraflage_vineyard')?.points).toBe(4);
  });

  it('Wurzelkeller: Münzen füttern Zeilen/Spalten', () => {
    const s = coinGame();
    put(s, 0, 0, 'cottage');
    put(s, 0, 1, 'cottage');
    put(s, 0, 15, 'root_cellar');
    s.players[0].coins = 1;
    const score = scorePlayer(s, 0, catalog);
    // 1 Münze → Zeile 0 → beide Hütten gefüttert (6 SP) statt 1 SP Münze
    expect(score.lines.find((l) => l.card === 'cottage')?.points).toBe(6);
    expect(score.coins).toEqual({ count: 0, spent: 1, points: 0 });
  });

  it('Zehntscheune: Nachbarn gratis, weitere je 2 für 1 Münze', () => {
    const s = coinGame();
    put(s, 0, 5, 'tithe_barn');
    put(s, 0, 1, 'cottage');  // angrenzend → gratis
    put(s, 0, 15, 'cottage'); // entfernt → kostet
    put(s, 0, 12, 'cottage'); // entfernt → kostet (2 für 1 Münze)
    s.players[0].coins = 1;
    const score = scorePlayer(s, 0, catalog);
    expect(score.lines.find((l) => l.card === 'cottage')?.points).toBe(9);
    expect(score.coins?.spent).toBe(1);
  });
});

describe('Fortune-Effekte: Teehaus, Promenade, Grotte', () => {
  /** Baut die Karte über ihr echtes Muster oben links aufs Brett. */
  function buildOn(s: GameState, player: number, card: string): GameState {
    const cells: number[] = [];
    catalog[card].pattern.forEach((row, r) =>
      row.forEach((c, cIdx) => {
        if (c) {
          const sq = r * 4 + cIdx;
          res(s, player, sq, c);
          cells.push(sq);
        }
      })
    );
    return a(s, { t: 'build', player, squares: cells, card, target: cells[0] });
  }

  it('Teehaus: +1 Münze je Gebäudetyp in Zeile ODER Spalte (bessere Achse, max 3)', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'teahouse', 'chapel', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    // Zeile des Zielfelds (1): drei verschiedene Typen; Spalte: nur einer
    put(s, 0, 0, 'cottage');
    put(s, 0, 2, 'chapel');
    put(s, 0, 3, 'tavern');
    put(s, 0, 9, 'farm');
    s = buildOn(s, 0, 'teahouse'); // Ziel = Feld 1
    expect(s.players[0].coins).toBe(3);
  });

  it('Blütenpromenade: Münzen auf freie Felder, Einsammeln bei fremder Ansage', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s.players[0].monument = { card: 'petal_promenade', built: false };
    s = buildOn(s, 0, 'petal_promenade'); // Ziel = Feld 0
    expect(s.players[0].choices[0]?.t).toBe('promenadeCoins');

    // belegtes Feld geht nicht
    expect(() => a(s, { t: 'resolvePromenade', player: 0, square: 0 })).toThrow(RuleError);

    s = a(s, { t: 'resolvePromenade', player: 0, square: 15 });
    expect(s.players[0].board[15].coin).toBe(true);
    // vorzeitig aufhören: Entscheidung ist erledigt
    s = a(s, { t: 'resolvePromenade', player: 0, square: null });
    expect(s.players[0].choices.length).toBe(0);

    // Fremde Ansage (Baumeister ist ein anderer): Material aufs Münzfeld → Münze
    s.masterBuilder = 1;
    s.players[0].pending = 'wood';
    s = a(s, { t: 'placeResource', player: 0, square: 15 });
    expect(s.players[0].coins).toBe(1);
    expect(s.players[0].board[15].coin).toBeUndefined();
  });

  it('Blütenpromenade: eigene Ansage sammelt die Münze nicht ein', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s.players[0].monument = { card: 'petal_promenade', built: false };
    s = buildOn(s, 0, 'petal_promenade');
    s = a(s, { t: 'resolvePromenade', player: 0, square: 15 });
    s = a(s, { t: 'resolvePromenade', player: 0, square: null });

    s.masterBuilder = 0; // eigene Ansage
    s.players[0].pending = 'wood';
    s = a(s, { t: 'placeResource', player: 0, square: 15 });
    expect(s.players[0].coins).toBe(0);
    expect(s.players[0].board[15].coin).toBe(true); // Münze bleibt liegen
  });

  it('Caterinas Grotte: Münzen auf freie Mittelfelder, Bauen sammelt ein', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    s.players[0].monument = { card: 'caterinas_grotto', built: false };
    s = buildOn(s, 0, 'caterinas_grotto'); // Ziel = Feld 1, Mittelfelder danach frei
    for (const c of [5, 6, 9, 10]) expect(s.players[0].board[c].coin).toBe(true);

    // Bau auf einem Münzfeld nimmt die Münze
    res(s, 0, 6, 'wood');
    res(s, 0, 7, 'stone');
    s = a(s, { t: 'build', player: 0, squares: [6, 7], card: 'well', target: 6 });
    expect(s.players[0].coins).toBe(1);
    expect(s.players[0].board[6].coin).toBeUndefined();
  });
});
