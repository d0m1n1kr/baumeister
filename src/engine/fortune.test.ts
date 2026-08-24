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

  it('Juwelier: ohne Münze erhalten alle anderen 1 Münze — erst am Rundenende', () => {
    let s = inRound(coinGame(3));
    for (const p of s.players) p.pending = null;
    s = buildOn(s, 0, 'jeweler');
    expect(s.players[0].coins).toBe(0);
    // sofort noch nichts — die Münzen kommen mit dem Rundenende
    expect(s.players[1].coins).toBe(0);
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'roundDone', player: 1 });
    s = a(s, { t: 'roundDone', player: 2 });
    expect(s.players[1].coins).toBe(1);
    expect(s.players[2].coins).toBe(1);
    expect(s.players[0].coins).toBe(0);
  });

  it('Juwelier: mit Münze wird sie bezahlt, niemand sonst erhält etwas', () => {
    let s = inRound(coinGame(3));
    for (const p of s.players) p.pending = null;
    s.players[0].coins = 1;
    s = buildOn(s, 0, 'jeweler');
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'roundDone', player: 1 });
    s = a(s, { t: 'roundDone', player: 2 });
    expect(s.players[0].coins).toBe(0);
    expect(s.players[1].coins).toBe(0);
  });

  it('Juwelier im Solo: ohne Münze nicht baubar', () => {
    const s = inRound(coinGame());
    s.config.solo = true;
    s.players[0].pending = null;
    expect(() => buildOn(s, 0, 'jeweler')).toThrow(RuleError);
  });

  it('Museum im Solo: Deck-Wahl gilt als fremde Ansage → Rückgabe möglich', () => {
    let s = inRound(coinGame(1, ['cottage', 'farm', 'museum', 'chapel', 'theater', 'tavern', 'factory']), 'wood');
    s.config.solo = true;
    s.masterBuilder = 0; // solo ist man immer selbst Baumeister
    put(s, 0, 15, 'museum', { stored: ['wood', 'glass'] });
    s = a(s, { t: 'museumSell', player: 0, square: 15 });
    expect(s.players[0].coins).toBe(1);
    expect(s.players[0].pending).toBeNull();
    expect(s.players[0].board[15].building?.stored).toEqual(['glass']);
  });

  it('Blütenpromenade im Solo: Pflichtfelder und Münzgewinn wie bei fremder Ansage', () => {
    let s = inRound(coinGame(1), 'wood');
    s.config.solo = true;
    s.masterBuilder = 0;
    s.players[0].monument = { card: 'petal_promenade', built: true };
    put(s, 0, 0, 'petal_promenade');
    s.players[0].board[15].coin = true;
    // freies Nicht-Münzfeld existiert → Platzieren daneben verboten
    expect(() => a(s, { t: 'placeResource', player: 0, square: 4 })).toThrow(RuleError);
    s = a(s, { t: 'placeResource', player: 0, square: 15 });
    expect(s.players[0].coins).toBe(1);
    expect(s.players[0].board[15].coin).toBeUndefined();
  });

  it('Bondmaker im Solo: Material darf auf die eigene Hütte', () => {
    let s = inRound(coinGame(1), 'wood');
    s.config.solo = true;
    s.masterBuilder = 0;
    s.players[0].monument = { card: 'statue_of_the_bondmaker', built: true };
    put(s, 0, 0, 'statue_of_the_bondmaker');
    put(s, 0, 5, 'cottage');
    s = a(s, { t: 'placeResource', player: 0, square: 5 });
    expect(s.players[0].board[5].resource).toBe('wood');
    expect(s.players[0].board[5].building?.card).toBe('cottage');
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

  it('Steinmetzgilde: je 1 Münze ein unterschiedliches Gebäude (mit dessen Bau-Effekt)', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s.players[0].coins = 2;
    s.players[0].monument = { card: 'masons_guild', built: false };
    s = buildOn(s, 0, 'masons_guild');
    expect(s.players[0].choices[0]?.t).toBe('masonsGuild');
    // die platzierte Mine bringt ihre Bau-Münze zurück (offizielle „Special Note")
    s = a(s, { t: 'resolveMasons', player: 0, card: 'mine', square: 15 });
    expect(s.players[0].board[15].building?.card).toBe('mine');
    expect(s.players[0].coins).toBe(2);
    expect(() => a(s, { t: 'resolveMasons', player: 0, card: 'mine', square: 14 })).toThrow(RuleError);
    s = a(s, { t: 'resolveMasons', player: 0, card: 'farm', square: 14 });
    expect(s.players[0].coins).toBe(1);
    // freiwillig aufhören
    s = a(s, { t: 'resolveMasons', player: 0, card: null });
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

  it('Kuriositätenladen: Baumeister-Zugriff gibt dem NEHMENDEN 1 Münze', () => {
    let s = coinGame();
    put(s, 1, 15, 'oddity_shop', { stored: ['glass'] });
    s.masterBuilder = 0;
    s = a(s, { t: 'oddityTake', player: 0, fromPlayer: 1, fromSquare: 15, targetSquare: 3 });
    expect(s.players[0].board[3].resource).toBe('glass');
    expect(s.players[0].coins).toBe(1);
    expect(s.players[1].coins).toBe(0);
    expect(s.players[1].board[15].building?.stored).toEqual([]);
    expect(() =>
      a(s, { t: 'oddityTake', player: 0, fromPlayer: 1, fromSquare: 15, targetSquare: 4 })
    ).toThrow(RuleError);
  });

  it('Museum: beim Bau 2 Materialien auflegen, passende Ansage → +1 Münze statt platzieren', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'museum', 'chapel', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    s = buildOn(s, 0, 'museum');
    expect(s.players[0].choices[0]?.t).toBe('museumStock');
    s = a(s, { t: 'resolveMuseumStock', player: 0, resource: 'wood' });
    s = a(s, { t: 'resolveMuseumStock', player: 0, resource: 'glass' });
    expect(s.players[0].choices.length).toBe(0);
    const museumSq = s.players[0].board.findIndex((sq) => sq.building?.card === 'museum');
    expect(s.players[0].board[museumSq].building?.stored).toEqual(['wood', 'glass']);

    // fremde Ansage „wood": zurückgeben statt platzieren
    s.masterBuilder = 1;
    s.players[0].pending = 'wood';
    s = a(s, { t: 'museumSell', player: 0, square: museumSq });
    expect(s.players[0].coins).toBe(1);
    expect(s.players[0].pending).toBeNull();
    expect(s.players[0].board[museumSq].building?.stored).toEqual(['glass']);
    // nur 1×/Runde
    s.players[0].pending = 'wood';
    expect(() => a(s, { t: 'museumSell', player: 0, square: museumSq })).toThrow(RuleError);
  });

  it('Museum: nicht passendes Material und eigene Ansage werden abgelehnt', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'museum', 'chapel', 'theater', 'tavern', 'factory']), 'brick');
    put(s, 0, 15, 'museum', { stored: ['wood', 'glass'] });
    // angesagt ist brick — liegt nicht auf dem Museum
    s.masterBuilder = 1;
    expect(() => a(s, { t: 'museumSell', player: 0, square: 15 })).toThrow(RuleError);
    // eigene Ansage zählt nicht
    const s2 = inRound(coinGame(2, ['cottage', 'farm', 'museum', 'chapel', 'theater', 'tavern', 'factory']), 'wood');
    put(s2, 0, 15, 'museum', { stored: ['wood'] });
    s2.masterBuilder = 0;
    expect(() => a(s2, { t: 'museumSell', player: 0, square: 15 })).toThrow(RuleError);
    // und das Museum ist kein Lagerhaus mehr
    const s3 = inRound(coinGame(2, ['cottage', 'farm', 'museum', 'chapel', 'theater', 'tavern', 'factory']), 'wood');
    put(s3, 0, 15, 'museum');
    expect(() => a(s3, { t: 'warehouseStore', player: 0, square: 15 })).toThrow(RuleError);
  });

  it('Kathedrale (Fortune): zahlen ist freiwillig, sonst entsteht das graue Gebäude', () => {
    // ohne 3 Münzen: nur Umwandeln möglich → Brunnen (graues Gebäude der Partie)
    let s = inRound(coinGame(2, ['cottage', 'farm', 'well', 'cathedral_fortune', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    s = buildOn(s, 0, 'cathedral_fortune');
    expect(s.players[0].choices[0]?.t).toBe('cathedralChoice');
    expect(() => a(s, { t: 'resolveCathedral', player: 0, pay: true })).toThrow(RuleError);
    s = a(s, { t: 'resolveCathedral', player: 0, pay: false });
    const built = s.players[0].board.find((sq) => sq.building);
    expect(built?.building?.card).toBe('well');

    // mit 3 Münzen: zahlen hält die Kathedrale
    let s2 = inRound(coinGame(2, ['cottage', 'farm', 'well', 'cathedral_fortune', 'theater', 'tavern', 'factory']));
    s2.players[0].pending = null;
    s2.players[0].coins = 3;
    s2 = buildOn(s2, 0, 'cathedral_fortune');
    s2 = a(s2, { t: 'resolveCathedral', player: 0, pay: true });
    expect(s2.players[0].coins).toBe(0);
    const built2 = s2.players[0].board.find((sq) => sq.building);
    expect(built2?.building?.card).toBe('cathedral_fortune');
  });

  it('Kathedrale (Fortune): Umbau zur Mine bringt deren Bau-Münze', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'mine', 'cathedral_fortune', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    s = buildOn(s, 0, 'cathedral_fortune');
    s = a(s, { t: 'resolveCathedral', player: 0, pay: false });
    const built = s.players[0].board.find((sq) => sq.building);
    expect(built?.building?.card).toBe('mine');
    expect(s.players[0].coins).toBe(1);
  });

  it('Schrein des Windes: +1 Münze je Gebäude des häufigsten Typs', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s.players[0].monument = { card: 'shrine_of_the_windseed', built: false };
    put(s, 0, 12, 'cottage');
    put(s, 0, 13, 'cottage');
    put(s, 0, 14, 'cottage');
    put(s, 0, 15, 'farm');
    s = buildOn(s, 0, 'shrine_of_the_windseed');
    expect(s.players[0].coins).toBe(3); // 3× Hütte ist der häufigste Typ
  });

  it('Münz-Slot: gebautes Slot-Monument erweitert die Truhe auf 5', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s.players[0].coins = 4;
    s.players[0].monument = { card: 'shrine_of_the_windseed', built: false };
    put(s, 0, 12, 'cottage');
    put(s, 0, 13, 'cottage');
    s = buildOn(s, 0, 'shrine_of_the_windseed');
    expect(s.players[0].coins).toBe(5); // 4 + 2 (Hütten), gedeckelt bei 5 statt 4
  });

  it('Okavers Schatzkammer: Truhe auf 4 gefüllt → Gratis-Hütte', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'mine', 'chapel', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    s.players[0].coins = 3;
    s.players[0].monument = { card: 'treasury_at_okaver', built: true };
    put(s, 0, 15, 'treasury_at_okaver');
    s = buildOn(s, 0, 'mine'); // +1 Münze → Truhe voll
    expect(s.players[0].coins).toBe(4);
    const okaver = s.players[0].choices.find((c) => c.t === 'okaverCottage');
    expect(okaver).toBeTruthy();
    s = a(s, { t: 'resolveOkaver', player: 0, square: 11 });
    expect(s.players[0].board[11].building?.card).toBe('cottage');
  });

  it('Hollow Hill: −2 Punkte je Münztausch nach dem Bau', () => {
    let s = coinGame();
    put(s, 0, 15, 'hollow_hill');
    s.players[0].monument = { card: 'hollow_hill', built: true };
    s.players[0].coins = 2;
    s.masterBuilder = 1;
    s = a(s, { t: 'nameResource', resource: 'wood' });
    s = a(s, { t: 'coinSwap', player: 0, take: 'glass' });
    expect(s.players[0].hollowHillSwaps).toBe(1);
    const score = scorePlayer(s, 0, catalog);
    expect(score.lines.find((l) => l.card === 'hollow_hill')?.points).toBe(5); // 7 − 2
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

  it('Südliches Semaphor: Zusatz-Material nur bei fremder Ansage, Platzieren bringt 1 Münze', () => {
    let s = coinGame();
    put(s, 0, 15, 'southern_semaphore');
    s.masterBuilder = 1;
    s = a(s, { t: 'nameResource', resource: 'wood' });
    expect(s.players[0].pendingExtra).toBe('wood');
    expect(s.players[1].pendingExtra).toBeFalsy(); // P1 hat kein Semaphor
    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    expect(s.players[0].pending).toBe('wood'); // Zusatz-Material rückt nach
    expect(s.players[0].pendingLocked).toBe(true);
    expect(() => a(s, { t: 'coinSwap', player: 0, take: 'glass' })).toThrow(RuleError);
    s = a(s, { t: 'placeResource', player: 0, square: 1 });
    expect(s.players[0].pending).toBeNull();
    expect(s.players[0].coins).toBe(1); // Münze fürs platzierte Zusatz-Material
  });

  it('Südliches Semaphor: eigene Ansage bringt kein Zusatz-Material', () => {
    let s = coinGame();
    put(s, 0, 15, 'southern_semaphore');
    s.masterBuilder = 0;
    s = a(s, { t: 'nameResource', resource: 'wood' });
    expect(s.players[0].pendingExtra).toBeFalsy();
  });

  it('Südliches Semaphor: Zusatz-Material ist freiwillig („Fertig" verzichtet)', () => {
    let s = coinGame();
    put(s, 0, 15, 'southern_semaphore');
    s.masterBuilder = 1;
    s = a(s, { t: 'nameResource', resource: 'wood' });
    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    expect(s.players[0].pendingLocked).toBe(true);
    s = a(s, { t: 'roundDone', player: 0 });
    expect(s.players[0].pending).toBeNull();
    expect(s.players[0].roundDone).toBe(true);
    expect(s.players[0].coins).toBe(0); // keine Münze ohne Platzierung
  });

  it('Südliches Semaphor: Münztausch des Erst-Materials verwirkt das Zusatz-Material', () => {
    let s = coinGame();
    put(s, 0, 15, 'southern_semaphore');
    s.players[0].coins = 1;
    s.masterBuilder = 1;
    s = a(s, { t: 'nameResource', resource: 'wood' });
    s = a(s, { t: 'coinSwap', player: 0, take: 'glass' });
    expect(s.players[0].pendingExtra).toBeFalsy();
    s = a(s, { t: 'placeResource', player: 0, square: 0 });
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

  it('Weingut Eraflage: 9 wenn gefüttert, −2 je Typ in Zeile/Spalte', () => {
    const s = coinGame();
    put(s, 0, 5, 'eraflage_vineyard');
    put(s, 0, 4, 'cottage');
    put(s, 0, 6, 'well');
    put(s, 0, 13, 'well'); // gleiche Spalte, gleicher Typ → zählt nur 1×
    // ungefüttert: 0 − 4
    let score = scorePlayer(s, 0, catalog);
    expect(score.lines.find((l) => l.card === 'eraflage_vineyard')?.points).toBe(-4);
    // mit Bauernhof: Weingut UND Hütte werden gefüttert → 9 − 4
    put(s, 0, 15, 'farm');
    score = scorePlayer(s, 0, catalog);
    expect(score.lines.find((l) => l.card === 'eraflage_vineyard')?.points).toBe(5);
    expect(score.lines.find((l) => l.card === 'cottage')?.points).toBe(3);
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

  it('Blütenpromenade: 3 Münzen sind Pflicht, fremde Ansagen MÜSSEN aufs Münzfeld', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s.players[0].monument = { card: 'petal_promenade', built: false };
    s = buildOn(s, 0, 'petal_promenade'); // Ziel = Feld 0
    expect(s.players[0].choices[0]?.t).toBe('promenadeCoins');

    // belegtes Feld geht nicht; vorzeitig abbrechen auch nicht
    expect(() => a(s, { t: 'resolvePromenade', player: 0, square: 0 })).toThrow(RuleError);
    expect(() => a(s, { t: 'resolvePromenade', player: 0, square: null })).toThrow(RuleError);

    s = a(s, { t: 'resolvePromenade', player: 0, square: 13 });
    s = a(s, { t: 'resolvePromenade', player: 0, square: 14 });
    s = a(s, { t: 'resolvePromenade', player: 0, square: 15 });
    expect(s.players[0].choices.length).toBe(0);
    expect(s.players[0].board[15].coin).toBe(true);

    // Fremde Ansage: Material MUSS auf ein Münzfeld — und bringt die Münze
    s.masterBuilder = 1;
    s.players[0].pending = 'wood';
    expect(() => a(s, { t: 'placeResource', player: 0, square: 4 })).toThrow(RuleError);
    s = a(s, { t: 'placeResource', player: 0, square: 15 });
    expect(s.players[0].coins).toBe(1);
    expect(s.players[0].board[15].coin).toBeUndefined();
    // das eingesammelte Material bleibt liegen (nicht verschiebbar)
    expect(() => a(s, { t: 'moveResource', player: 0, square: 4 })).toThrow(RuleError);
  });

  it('Blütenpromenade: eigene Ansagen dürfen nicht auf Münzfelder', () => {
    let s = inRound(coinGame());
    s.players[0].pending = null;
    s.players[0].monument = { card: 'petal_promenade', built: false };
    s = buildOn(s, 0, 'petal_promenade');
    s = a(s, { t: 'resolvePromenade', player: 0, square: 13 });
    s = a(s, { t: 'resolvePromenade', player: 0, square: 14 });
    s = a(s, { t: 'resolvePromenade', player: 0, square: 15 });

    s.masterBuilder = 0; // eigene Ansage
    s.players[0].pending = 'wood';
    expect(() => a(s, { t: 'placeResource', player: 0, square: 15 })).toThrow(RuleError);
    s = a(s, { t: 'placeResource', player: 0, square: 4 });
    expect(s.players[0].coins).toBe(0);
    expect(s.players[0].board[15].coin).toBe(true); // Münzen bleiben liegen
  });

  it('Caterinas Grotte: Münzen auf alle Mittelfelder, bebaute sofort, Bauen sammelt ein', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    s.players[0].monument = { card: 'caterinas_grotto', built: false };
    put(s, 0, 10, 'cottage'); // bebautes Mittelfeld → Münze sofort
    s = buildOn(s, 0, 'caterinas_grotto');
    expect(s.players[0].coins).toBe(1);
    for (const c of [5, 6, 9]) expect(s.players[0].board[c].coin).toBe(true);
    expect(s.players[0].board[10].coin).toBeUndefined();

    // Material darf sich das Feld mit der Münze teilen — die Münze bleibt liegen
    s.masterBuilder = 1;
    s.players[0].pending = 'wood';
    s = a(s, { t: 'placeResource', player: 0, square: 9 });
    expect(s.players[0].coins).toBe(1);
    expect(s.players[0].board[9].coin).toBe(true);

    // Bau auf einem Münzfeld nimmt die Münze
    res(s, 0, 5, 'wood');
    res(s, 0, 6, 'stone');
    s = a(s, { t: 'build', player: 0, squares: [5, 6], card: 'well', target: 6 });
    expect(s.players[0].coins).toBe(2);
    expect(s.players[0].board[6].coin).toBeUndefined();
  });

  it('Prismenschmiede: 2 unterschiedliche Gebäude, Reste werden entfernt, beide zählen', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'factory']));
    for (const p of s.players) p.pending = null;
    put(s, 0, 12, 'prism_forge');
    // Bauernhof (wheat²/wood²) und Brunnen (wood+stone) überlappen im wood auf Feld 4
    res(s, 0, 0, 'wheat'); res(s, 0, 1, 'wheat');
    res(s, 0, 4, 'wood'); res(s, 0, 5, 'wood'); res(s, 0, 8, 'stone');
    s = a(s, { t: 'build', player: 0, squares: [0, 1, 4, 5], card: 'farm', target: 0, prism: true });
    expect(s.players[0].board[4].resource).toBe('wood'); // liegt für den 2. Bau noch
    s = a(s, { t: 'build', player: 0, squares: [4, 8], card: 'well', target: 8 });
    expect(s.players[0].board[1].resource).toBeUndefined(); // Prisma-Reste entfernt
    expect(s.players[0].board[5].resource).toBeUndefined();
    expect(s.players[0].buildsThisRound).toBe(2);
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'roundDone', player: 1 });
    expect(s.players[0].coins).toBe(1); // 2 Bauten → Rundenmünze
  });

  it('Prismenschmiede: dasselbe Gebäude zweimal ist verboten', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'factory']));
    for (const p of s.players) p.pending = null;
    put(s, 0, 12, 'prism_forge');
    res(s, 0, 0, 'wood'); res(s, 0, 1, 'stone');
    s = a(s, { t: 'build', player: 0, squares: [0, 1], card: 'well', target: 0, prism: true });
    res(s, 0, 2, 'wood'); res(s, 0, 3, 'stone');
    expect(() =>
      a(s, { t: 'build', player: 0, squares: [2, 3], card: 'well', target: 2 })
    ).toThrow(RuleError);
  });

  it('Prismenschmiede: ohne zweiten Bau räumt „Fertig" die Reste ab', () => {
    let s = inRound(coinGame(2, ['cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'factory']));
    for (const p of s.players) p.pending = null;
    put(s, 0, 12, 'prism_forge');
    res(s, 0, 0, 'wood'); res(s, 0, 1, 'stone');
    s = a(s, { t: 'build', player: 0, squares: [0, 1], card: 'well', target: 0, prism: true });
    expect(s.players[0].board[1].resource).toBe('stone');
    s = a(s, { t: 'roundDone', player: 0 });
    expect(s.players[0].board[1].resource).toBeUndefined();
  });
});
