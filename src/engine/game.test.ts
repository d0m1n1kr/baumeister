import { describe, it, expect } from 'vitest';
import { apply, newGame, RuleError } from './game';
import { catalog, config, freshGame, inRound, put, res, ACTIVE_DEFAULT } from './test-helpers';
import { idx } from './types';
import type { GameState } from './types';

const a = (s: GameState, action: Parameters<typeof apply>[1]) => apply(s, action, catalog);

describe('Monument-Draft', () => {
  it('jeder Spieler wählt 1 von 2, dann startet die Runde', () => {
    let s = newGame(config(2, ACTIVE_DEFAULT, true, [
      ['the_starloom', 'mandras_palace'],
      ['cathedral_of_caterina', 'silva_forum']
    ]));
    expect(s.phase.t).toBe('monumentDraft');
    s = a(s, { t: 'chooseMonument', player: 0, card: 'mandras_palace' });
    expect(s.phase.t).toBe('monumentDraft');
    expect(() => a(s, { t: 'chooseMonument', player: 1, card: 'the_starloom' })).toThrow(RuleError);
    s = a(s, { t: 'chooseMonument', player: 1, card: 'silva_forum' });
    expect(s.phase.t).toBe('nameResource');
    expect(s.players[0].monument).toEqual({ card: 'mandras_palace', built: false });
  });
});

describe('Rundenablauf', () => {
  it('Material ansagen → platzieren → Runde beenden → nächster Baumeister', () => {
    let s = freshGame(2);
    expect(s.masterBuilder).toBe(0);
    s = a(s, { t: 'nameResource', resource: 'wood' });
    expect(s.phase).toEqual({ t: 'round', resource: 'wood' });
    expect(s.players[0].pending).toBe('wood');
    expect(s.players[0].masterBuilderTurns).toBe(1);

    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    s = a(s, { t: 'placeResource', player: 1, square: 5 });
    expect(s.players[0].board[0].resource).toBe('wood');

    // Doppelt belegen verboten
    expect(() => a(s, { t: 'roundDone', player: 0 })).not.toThrow();
    s = a(s, { t: 'roundDone', player: 0 });
    expect(s.phase.t).toBe('round'); // P1 noch nicht fertig
    s = a(s, { t: 'roundDone', player: 1 });
    expect(s.phase.t).toBe('nameResource');
    expect(s.masterBuilder).toBe(1);
  });

  it('unbestätigtes Material kann bis zum „Fertig" verschoben werden', () => {
    let s = freshGame(2);
    s = a(s, { t: 'nameResource', resource: 'wood' });
    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    expect(s.players[0].placedSquare).toBe(0);

    s = a(s, { t: 'moveResource', player: 0, square: 7 });
    expect(s.players[0].board[0].resource).toBeUndefined();
    expect(s.players[0].board[7].resource).toBe('wood');
    expect(s.players[0].placedSquare).toBe(7);

    // belegtes Ziel wird abgelehnt
    put(s, 0, 3, 'well');
    expect(() => a(s, { t: 'moveResource', player: 0, square: 3 })).toThrow(RuleError);

    // nach „Fertig" ist nichts mehr verschiebbar
    s = a(s, { t: 'roundDone', player: 0 });
    expect(() => a(s, { t: 'moveResource', player: 0, square: 8 })).toThrow(RuleError);
  });

  it('verbautes Material ist nicht mehr verschiebbar', () => {
    let s = freshGame(2);
    s = a(s, { t: 'nameResource', resource: 'wood' });
    res(s, 0, 1, 'stone');
    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    s = a(s, { t: 'build', player: 0, squares: [0, 1], card: 'well', target: 0 });
    expect(() => a(s, { t: 'moveResource', player: 0, square: 8 })).toThrow(RuleError);
  });

  it('belegte Felder und fehlendes Material werden abgelehnt', () => {
    let s = freshGame(2);
    s = a(s, { t: 'nameResource', resource: 'wood' });
    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    expect(() => a(s, { t: 'placeResource', player: 1, square: 0 })).not.toThrow(); // anderes Brett!
    expect(() => a(s, { t: 'placeResource', player: 0, square: 1 })).toThrow(RuleError);
    expect(() => a(s, { t: 'roundDone', player: 1 })).toThrow(RuleError); // noch nicht platziert
  });
});

describe('Bauen', () => {
  it('validiert Muster, entfernt Materialien, setzt Gebäude', () => {
    let s = inRound(freshGame(2), 'glass');
    res(s, 0, idx(0, 1), 'wheat');
    res(s, 0, idx(1, 0), 'brick');
    res(s, 0, idx(1, 1), 'glass');
    s.players[0].pending = null;
    s = a(s, { t: 'build', player: 0, squares: [idx(0, 1), idx(1, 0), idx(1, 1)], card: 'cottage', target: idx(1, 1) });
    expect(s.players[0].board[idx(1, 1)].building?.card).toBe('cottage');
    expect(s.players[0].board[idx(0, 1)].resource).toBeUndefined();
  });

  it('Bauplatz muss Materialfeld sein (außer Schuppen/Obelisk)', () => {
    const base = inRound(freshGame(2, ['cottage', 'farm', 'shed', 'chapel', 'theater', 'tavern', 'factory']));
    res(base, 0, 0, 'wood');
    res(base, 0, 1, 'stone');
    base.players[0].pending = null;
    expect(() =>
      a(base, { t: 'build', player: 0, squares: [0, 1], card: 'shed', target: 15 })
    ).not.toThrow(); // Schuppen darf überall hin
    const s2 = structuredClone(base);
    put(s2, 0, 5, 'well'); // fremde Karte nicht im Spiel? well ist nicht aktiv → nur Muster zählt hier
    expect(() =>
      a(s2, { t: 'build', player: 0, squares: [0, 1], card: 'well', target: 15 })
    ).toThrow(RuleError); // well nicht in activeCards
  });

  it('Obelisk erlaubt freie Platzwahl für alle Gebäude', () => {
    let s = inRound(freshGame(2));
    put(s, 0, 10, 'obelisk_of_the_crescent');
    res(s, 0, 0, 'wood');
    res(s, 0, 1, 'stone');
    s.players[0].pending = null;
    s = a(s, { t: 'build', player: 0, squares: [0, 1], card: 'well', target: 15 });
    expect(s.players[0].board[15].building?.card).toBe('well');
  });

  it('Handelsposten bleibt beim Bauen stehen', () => {
    let s = inRound(freshGame(2));
    put(s, 0, 0, 'trading_post');
    res(s, 0, 1, 'stone'); // W-S-Muster: Wild + Stein
    s.players[0].pending = null;
    s = a(s, { t: 'build', player: 0, squares: [0, 1], card: 'well', target: 1 });
    expect(s.players[0].board[0].building?.card).toBe('trading_post');
    expect(s.players[0].board[1].building?.card).toBe('well');
  });

  it('Monument nur einmal baubar; wird beim Bau aufgedeckt', () => {
    let s = inRound(freshGame(2));
    s.players[0].monument = { card: 'the_starloom', built: false };
    // Muster [[G,G],[W,H]]
    res(s, 0, idx(0, 0), 'glass');
    res(s, 0, idx(0, 1), 'glass');
    res(s, 0, idx(1, 0), 'wood');
    res(s, 0, idx(1, 1), 'wheat');
    s.players[0].pending = null;
    s = a(s, { t: 'build', player: 0, squares: [0, 1, 4, 5], card: 'the_starloom', target: 0 });
    expect(s.players[0].monument?.built).toBe(true);
    expect(() =>
      a(s, { t: 'build', player: 0, squares: [0, 1, 4, 5], card: 'the_starloom', target: 0 })
    ).toThrow(RuleError);
  });

  it('Schrein merkt sich die Gebäudezahl beim Bau', () => {
    let s = inRound(freshGame(2));
    s.players[0].monument = { card: 'shrine_of_the_elder_tree', built: false };
    put(s, 0, 15, 'well');
    put(s, 0, 14, 'well');
    // Muster [[B,H,S],[W,G,W]]
    res(s, 0, idx(0, 0), 'brick');
    res(s, 0, idx(0, 1), 'wheat');
    res(s, 0, idx(0, 2), 'stone');
    res(s, 0, idx(1, 0), 'wood');
    res(s, 0, idx(1, 1), 'glass');
    res(s, 0, idx(1, 2), 'wood');
    s.players[0].pending = null;
    s = a(s, { t: 'build', player: 0, squares: [0, 1, 2, 4, 5, 6], card: 'shrine_of_the_elder_tree', target: 0 });
    expect(s.players[0].shrineSnapshot).toBe(3); // 2 Brunnen + Schrein
  });
});

describe('Schwarze Gebäude', () => {
  it('Fabrik: Markieren nach Bau, Tausch bei fremder Ansage', () => {
    let s = inRound(freshGame(2), 'glass');
    // Fabrik direkt bauen: Muster [[W,_,_,_],[B,S,S,B]]
    res(s, 0, idx(0, 0), 'wood');
    res(s, 0, idx(1, 0), 'brick');
    res(s, 0, idx(1, 1), 'stone');
    res(s, 0, idx(1, 2), 'stone');
    res(s, 0, idx(1, 3), 'brick');
    s.players[0].pending = null;
    s = a(s, { t: 'build', player: 0, squares: [0, 4, 5, 6, 7], card: 'factory', target: 4 });
    expect(s.players[0].choices[0]?.t).toBe('markResource');
    expect(() => a(s, { t: 'roundDone', player: 0 })).toThrow(RuleError); // Entscheidung offen
    s = a(s, { t: 'resolveMark', player: 0, resource: 'wheat' });
    expect(s.players[0].board[4].building?.marked).toBe('wheat');

    // P1 sagt wheat an → P0 darf tauschen
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'placeResource', player: 1, square: 0 });
    s = a(s, { t: 'roundDone', player: 1 });
    expect(s.masterBuilder).toBe(1);
    s = a(s, { t: 'nameResource', resource: 'wheat' });
    s = a(s, { t: 'factorySwap', player: 0, take: 'glass' });
    expect(s.players[0].pending).toBe('glass');
    // Baumeister selbst darf nicht tauschen
    expect(() => a(s, { t: 'factorySwap', player: 1, take: 'wood' })).toThrow(RuleError);
  });

  it('Bank: gesperrtes Material darf der Besitzer nicht ansagen', () => {
    let s = freshGame(2);
    put(s, 0, 0, 'bank', { marked: 'glass' });
    expect(() => a(s, { t: 'nameResource', resource: 'glass' })).toThrow(RuleError);
    expect(() => a(s, { t: 'nameResource', resource: 'wood' })).not.toThrow();
  });

  it('Lagerhaus: einlagern und tauschen', () => {
    let s = inRound(freshGame(2), 'wood');
    put(s, 0, 0, 'warehouse');
    s = a(s, { t: 'warehouseStore', player: 0, square: 0 });
    expect(s.players[0].board[0].building?.stored).toEqual(['wood']);
    expect(s.players[0].pending).toBeNull();

    s = inRound(s, 'glass');
    s = a(s, { t: 'warehouseSwap', player: 0, square: 0, storedIndex: 0 });
    expect(s.players[0].board[0].building?.stored).toEqual(['glass']);
    expect(s.players[0].pending).toBe('wood');
  });
});

describe('Monument-Effekte', () => {
  it('Architektengilde: bis zu 2 Gebäude ersetzen', () => {
    let s = inRound(freshGame(2));
    put(s, 0, 14, 'well');
    s.players[0].choices.push({ t: 'architectsGuild', square: 15, remaining: 2 });
    s = a(s, { t: 'resolveGuild', player: 0, square: 14, newCard: 'tavern' });
    expect(s.players[0].board[14].building?.card).toBe('tavern');
    expect(s.players[0].choices.length).toBe(1);
    s = a(s, { t: 'resolveGuild', player: 0, square: null });
    expect(s.players[0].choices.length).toBe(0);
  });

  it('Hain-Universität: Gratis-Gebäude aus dem Vorrat', () => {
    let s = inRound(freshGame(2));
    s.players[0].choices.push({ t: 'groveUniversity', square: 0 });
    s = a(s, { t: 'resolveGrove', player: 0, card: 'well', square: 5 });
    expect(s.players[0].board[5].building?.card).toBe('well');
  });

  it('Opaleyes Wacht: Vorrat anlegen und bei Nachbar-Bau erhalten', () => {
    let s = inRound(freshGame(2));
    put(s, 1, 15, 'opaleyes_watch');
    s.players[1].choices.push({ t: 'opaleyeSetup', square: 15, remaining: 3 });
    s = a(s, { t: 'resolveOpaleyeSetup', player: 1, card: 'well' });
    s = a(s, { t: 'resolveOpaleyeSetup', player: 1, card: 'tavern' });
    s = a(s, { t: 'resolveOpaleyeSetup', player: 1, card: null });
    expect(s.players[1].board[15].building?.stock).toEqual(['well', 'tavern']);

    // P0 baut einen Brunnen → P1 bekommt die Wahl
    res(s, 0, 0, 'wood');
    res(s, 0, 1, 'stone');
    s.players[0].pending = null;
    s = a(s, { t: 'build', player: 0, squares: [0, 1], card: 'well', target: 0 });
    expect(s.players[1].choices[0]?.t).toBe('opaleyeClaim');
    s = a(s, { t: 'resolveOpaleyeClaim', player: 1, accept: true, square: 3 });
    expect(s.players[1].board[3].building?.card).toBe('well');
    expect(s.players[1].board[15].building?.stock).toEqual(['tavern']);
  });

  it('Bondmaker: fremd angesagtes Material auf Hütte lagern', () => {
    let s = freshGame(2);
    s.masterBuilder = 1;
    s = a(s, { t: 'nameResource', resource: 'wood' });
    put(s, 0, 0, 'cottage');
    s.players[0].monument = { card: 'statue_of_the_bondmaker', built: true };
    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    expect(s.players[0].board[0].resource).toBe('wood');
    expect(s.players[0].board[0].building?.card).toBe('cottage');
  });

  it('Fort Eisenkraut: Besitzer wird als Baumeister übersprungen', () => {
    let s = inRound(freshGame(3));
    put(s, 1, 0, 'fort_ironweed');
    for (const p of s.players) p.pending = null;
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'roundDone', player: 1 });
    s = a(s, { t: 'roundDone', player: 2 });
    expect(s.masterBuilder).toBe(2); // P1 übersprungen
  });
});

describe('Spielende', () => {
  it('Stadt fertig nur bei vollem Brett; alle fertig → gameOver', () => {
    let s = inRound(freshGame(2));
    for (const p of s.players) p.pending = null;
    expect(() => a(s, { t: 'declareComplete', player: 0 })).toThrow(RuleError);
    for (let i = 0; i < 16; i++) {
      put(s, 0, i, 'cottage');
      put(s, 1, i, 'cottage');
    }
    s = a(s, { t: 'declareComplete', player: 0 });
    expect(s.players[0].done).toBe(true);
    expect(s.players[0].finishRound).toBe(s.round);
    expect(s.phase.t).toBe('round');
    s = a(s, { t: 'declareComplete', player: 1 });
    expect(s.phase.t).toBe('gameOver');
  });

  it('fertige Spieler erhalten kein Material mehr', () => {
    let s = inRound(freshGame(2));
    for (const p of s.players) p.pending = null;
    for (let i = 0; i < 16; i++) put(s, 0, i, 'cottage');
    s = a(s, { t: 'declareComplete', player: 0 });
    s = a(s, { t: 'roundDone', player: 1 });
    s = a(s, { t: 'nameResource', resource: 'wood' });
    expect(s.players[0].pending).toBeNull();
    expect(s.players[0].roundDone).toBe(true);
    expect(s.players[1].pending).toBe('wood');
  });
});

describe('Baumeister-Folge und Bank-Sperre', () => {
  it('überspringt fertige Spieler bei der Baumeister-Übergabe', () => {
    let s = inRound(freshGame(3));
    s.players[1].done = true;
    s.players[1].roundDone = true;
    s.players[0].pending = null;
    s.players[2].pending = null;
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'roundDone', player: 2 });
    expect(s.phase.t).toBe('nameResource');
    expect(s.masterBuilder).toBe(2); // Spieler 1 ist fertig und wird übersprungen
  });

  it('Fort Ironweed: Besitzer wird Baumeister, wenn sonst niemand mehr aktiv ist', () => {
    let s = inRound(freshGame(2));
    put(s, 1, 15, 'fort_ironweed');
    s.players[0].done = true;
    s.players[0].roundDone = true;
    s.players[0].pending = null;
    s.players[1].pending = null;
    s = a(s, { t: 'roundDone', player: 1 });
    expect(s.phase.t).toBe('nameResource');
    expect(s.masterBuilder).toBe(1); // 1. Wahl meidet das Fort, 2. Wahl greift
  });

  it('Bank: dasselbe Material darf nicht auf zwei Banken liegen', () => {
    let s = inRound(freshGame(2, ['cottage', 'farm', 'well', 'bank', 'theater', 'tavern', 'factory']));
    s.players[0].pending = null;
    put(s, 0, 15, 'bank', { marked: 'wood' });
    // zweite Bank regulär bauen: Muster [wheat,wheat,·],[wood,glass,brick]
    res(s, 0, 0, 'wheat'); res(s, 0, 1, 'wheat');
    res(s, 0, 4, 'wood'); res(s, 0, 5, 'glass'); res(s, 0, 6, 'brick');
    s = a(s, { t: 'build', player: 0, squares: [0, 1, 4, 5, 6], card: 'bank', target: 0 });
    expect(s.players[0].choices[0]?.t).toBe('markResource');

    expect(() => a(s, { t: 'resolveMark', player: 0, resource: 'wood' })).toThrow(RuleError);
    s = a(s, { t: 'resolveMark', player: 0, resource: 'stone' });
    expect(s.players[0].board[0].building?.marked).toBe('stone');
    expect(s.players[0].choices.length).toBe(0);
  });
});
