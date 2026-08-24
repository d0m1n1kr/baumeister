import { describe, it, expect } from 'vitest';
import { apply, newGame, RuleError } from './game';
import { mulberry32, randomSetup, TOWNHALL_EXCLUDED } from './registry';
import { actionAllowed } from '../net/seats';
import { catalog, config as baseConfig, put, res } from './test-helpers';
import type { GameConfig, GameState, Resource } from './types';

const a = (s: GameState, action: Parameters<typeof apply>[1]) => apply(s, action, catalog);

const DECK: Resource[] = [
  'wood', 'brick', 'stone', 'wheat', 'glass',
  'wood', 'brick', 'stone', 'wheat', 'glass',
  'wood', 'brick', 'stone', 'wheat', 'glass'
];

function thConfig(n = 2, active?: string[], systems: { coins?: boolean; cavern?: boolean } = {}): GameConfig {
  const cfg = baseConfig(n, active, false, undefined, systems);
  cfg.townHall = true;
  cfg.townHallDeck = [...DECK];
  cfg.thSeed = 42;
  return cfg;
}

describe('Rathaus: Setup', () => {
  const players = [{ name: 'A', corner: 0 }, { name: 'B', corner: 1 }];

  it('baut ein 15er-Deck und schließt mit Fortune den Kuriositätenladen aus', () => {
    for (let seed = 0; seed < 25; seed++) {
      const cfg = randomSetup(
        catalog, players, true, mulberry32(seed), ['base', 'fortune'],
        { coins: true }, false, true
      );
      expect(cfg.townHall).toBe(true);
      expect(cfg.townHallDeck).toHaveLength(15);
      for (const r of ['wood', 'brick', 'stone', 'wheat', 'glass']) {
        expect(cfg.townHallDeck!.filter((x) => x === r)).toHaveLength(3);
      }
      for (const id of TOWNHALL_EXCLUDED) {
        expect(cfg.activeCards).not.toContain(id);
      }
    }
  });

  it('newGame wirft 5 Karten verdeckt ab (10 im Stapel)', () => {
    const s = newGame(thConfig());
    expect(s.thDeck).toHaveLength(10);
    expect(s.thDiscard).toHaveLength(5);
    expect(s.thShuffles).toBe(0);
  });
});

describe('Rathaus: Rundenablauf', () => {
  it('zwei Zieh-Runden, dann freie Wahl; der Bürgermeister bleibt derselbe', () => {
    let s = newGame(thConfig());
    expect(() => a(s, { t: 'nameResource', resource: 'wood' })).toThrow(RuleError);

    // Runde 1: oberste Karte (deck[5] = 'wood' nach 5 Abwürfen)
    const first = s.thDeck![0];
    s = a(s, { t: 'townHallDraw' });
    expect(s.phase).toEqual({ t: 'round', resource: first });
    expect(s.players[0].pending).toBe(first);
    expect(s.players[1].pending).toBe(first);
    expect(s.thDeck).toHaveLength(9);
    expect(s.thDiscard).toHaveLength(6);

    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    s = a(s, { t: 'placeResource', player: 1, square: 0 });
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'roundDone', player: 1 });
    expect(s.masterBuilder).toBe(0); // rotiert nicht

    // Runde 2: wieder ziehen
    s = a(s, { t: 'townHallDraw' });
    s = a(s, { t: 'placeResource', player: 0, square: 1 });
    s = a(s, { t: 'placeResource', player: 1, square: 1 });
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'roundDone', player: 1 });

    // Runde 3: freie Wahl — keine Karte wird gezogen
    const deckBefore = s.thDeck!.length;
    s = a(s, { t: 'townHallDraw' });
    expect(s.phase).toEqual({ t: 'round', resource: null });
    expect(s.thDeck).toHaveLength(deckBefore);
    expect(s.players[0].pending).toBeNull();

    // Fertig ohne Wahl+Platzierung ist verboten
    expect(() => a(s, { t: 'roundDone', player: 0 })).toThrow(RuleError);
    s = a(s, { t: 'townHallPick', player: 0, resource: 'glass' });
    expect(s.players[0].pending).toBe('glass');
    s = a(s, { t: 'placeResource', player: 0, square: 2 });
    s = a(s, { t: 'roundDone', player: 0 });
    expect(s.players[0].roundDone).toBe(true);
  });

  it('leerer Stapel: Abwurf wird deterministisch neu gemischt, 5 wieder abgeworfen', () => {
    const s0 = newGame(thConfig());
    s0.thDeck = []; // Stapel künstlich leeren
    s0.thDiscard = [...DECK]; // alle 15 im Abwurf
    const s1 = a(s0, { t: 'townHallDraw' });
    expect(s1.thShuffles).toBe(1);
    expect(s1.thDiscard).toHaveLength(6); // 5 abgeworfen + die gezogene Karte
    expect(s1.thDeck).toHaveLength(9);
    // deterministisch: gleicher Zustand → gleiche Karte
    const s2 = a(s0, { t: 'townHallDraw' });
    expect(s2.phase).toEqual(s1.phase);
    expect(s2.thDeck).toEqual(s1.thDeck);
  });
});

describe('Rathaus: Karten-Interaktionen', () => {
  it('Zieh-Runde gilt für alle als fremde Ansage (Fabrik, Münztausch, Höhle)', () => {
    let s = newGame(thConfig(2, undefined, { coins: true, cavern: true }));
    s.players.forEach((p) => { p.coins = 1; });
    put(s, 0, 15, 'factory', { marked: 'wood' });
    s = a(s, { t: 'townHallDraw' });
    const named = s.phase.t === 'round' ? s.phase.resource : null;
    if (named === 'wood') {
      // Spieler 0 ist nominell Bürgermeister — die Fabrik wirkt trotzdem
      const swapped = a(s, { t: 'factorySwap', player: 0, take: 'glass' });
      expect(swapped.players[0].pending).toBe('glass');
    }
    const coinSwapped = a(s, { t: 'coinSwap', player: 0, take: named === 'glass' ? 'stone' : 'glass' });
    expect(coinSwapped.players[0].coins).toBe(0);
    const caverned = a(s, { t: 'cavern', player: 0 });
    expect(caverned.players[0].cavernUsed).toBe(1);
  });

  it('Wahlrunde: Bank sperrt die Wahl, Lagerhaus und Höhle sind tabu', () => {
    let s = newGame(thConfig(2, ['cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'bank'], { coins: true, cavern: true }));
    s.round = 2; // nächste Runde ist die 3. → freie Wahl
    put(s, 0, 15, 'bank', { marked: 'wood' });
    put(s, 0, 14, 'warehouse');
    s = a(s, { t: 'townHallDraw' });
    expect(s.phase).toEqual({ t: 'round', resource: null });
    expect(() => a(s, { t: 'townHallPick', player: 0, resource: 'wood' })).toThrow(RuleError);
    s = a(s, { t: 'townHallPick', player: 0, resource: 'glass' });
    expect(() => a(s, { t: 'warehouseStore', player: 0, square: 14 })).toThrow(RuleError);
    expect(() => a(s, { t: 'cavern', player: 0 })).toThrow(RuleError);
  });

  it('Fort Eisenkraut setzt in Wahlrunden aus (außer als letzter Spieler)', () => {
    let s = newGame(thConfig());
    s.round = 2;
    s.players[0].monument = { card: 'fort_ironweed', built: true };
    put(s, 0, 15, 'fort_ironweed');
    s = a(s, { t: 'townHallDraw' });
    expect(() => a(s, { t: 'townHallPick', player: 0, resource: 'wood' })).toThrow(RuleError);
    // ohne Wahl darf der Fort-Besitzer die Runde beenden
    const done = a(s, { t: 'roundDone', player: 0 });
    expect(done.players[0].roundDone).toBe(true);
    // als letzter aktiver Spieler darf er wieder wählen
    s.players[1].done = true;
    const picked = a(s, { t: 'townHallPick', player: 0, resource: 'wood' });
    expect(picked.players[0].pending).toBe('wood');
  });

  it('Südliches Semaphor bekommt sein Zusatz-Material in Zieh-Runden', () => {
    let s = newGame(thConfig(2, undefined, { coins: true }));
    put(s, 0, 15, 'southern_semaphore');
    s = a(s, { t: 'townHallDraw' });
    const named = s.phase.t === 'round' ? s.phase.resource : null;
    expect(s.players[0].pendingExtra).toBe(named);
  });

  it('nur der Bürgermeister-Sitz darf ziehen (Mehrgeräte-Schutz)', () => {
    const s = newGame(thConfig());
    expect(actionAllowed({ t: 'townHallDraw' }, 0, s)).toBeNull();
    expect(actionAllowed({ t: 'townHallDraw' }, 1, s)).toBeTruthy();
    expect(actionAllowed({ t: 'townHallPick', player: 1, resource: 'wood' }, 1, s)).toBeNull();
  });
});
