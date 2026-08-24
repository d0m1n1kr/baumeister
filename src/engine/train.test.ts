import { describe, it, expect } from 'vitest';
import { apply, newGame, RuleError, trainCycle, trainStopPlayer } from './game';
import { mulberry32, randomSetup } from './registry';
import { scorePlayer } from './scoring';
import { catalog, config as baseConfig, put, inRound } from './test-helpers';
import type { GameConfig, GameState } from './types';

const a = (s: GameState, action: Parameters<typeof apply>[1]) => apply(s, action, catalog);

function trainConfig(n = 2, pos = 0): GameConfig {
  const cfg = baseConfig(n, [...baseConfig(n).activeCards, 'train_station']);
  cfg.systems.train = true;
  cfg.trainStart = pos;
  return cfg;
}

/** Spiel in Runde mit Zug an Position pos, Spieler 0 hat einen Bahnhof. */
function stopAt(pos: number, n = 2): GameState {
  const s = newGame(trainConfig(n, pos));
  put(s, 0, 15, 'train_station');
  return inRound(s, 'wood');
}

describe('Eisenbahn: Setup', () => {
  const players = [{ name: 'A', corner: 0 }, { name: 'B', corner: 1 }];

  it('randomSetup legt den Bahnhof als 8. Karte aus und setzt eine Startposition', () => {
    for (let seed = 0; seed < 25; seed++) {
      const cfg = randomSetup(
        catalog, players, false, mulberry32(seed), ['base'], {}, false, false, true
      );
      expect(cfg.systems.train).toBe(true);
      expect(cfg.activeCards).toHaveLength(8);
      expect(cfg.activeCards[7]).toBe('train_station');
      expect(cfg.trainStart).toBeGreaterThanOrEqual(0);
      expect(cfg.trainStart).toBeLessThan(3); // 2 Spieler → Zyklus 3
    }
  });

  it('ohne Zug taucht der Bahnhof nie auf', () => {
    for (let seed = 0; seed < 25; seed++) {
      const cfg = randomSetup(catalog, players, false, mulberry32(seed));
      expect(cfg.activeCards).not.toContain('train_station');
      expect(cfg.systems.train).toBeFalsy();
      expect(cfg.trainStart).toBeUndefined();
    }
  });

  it('newGame initialisiert Zug mit 3 leeren Waggons', () => {
    const s = newGame(trainConfig(2, 1));
    expect(s.train).toEqual({ pos: 1, wagons: [null, null, null] });
    expect(newGame(baseConfig(2)).train).toBeUndefined();
  });
});

describe('Eisenbahn: Fahrt und Halt', () => {
  it('fährt am Rundenende eine Position weiter (Zyklus = max(Spieler, 3))', () => {
    let s = stopAt(0, 2);
    expect(trainCycle(s)).toBe(3);
    s = a(s, { t: 'placeResource', player: 0, square: 0 });
    s = a(s, { t: 'placeResource', player: 1, square: 0 });
    s = a(s, { t: 'roundDone', player: 0 });
    s = a(s, { t: 'roundDone', player: 1 });
    expect(s.train!.pos).toBe(1);
  });

  it('hält nur bei einer Stadt mit gebautem Bahnhof', () => {
    const s0 = stopAt(0);
    expect(trainStopPlayer(s0, catalog)).toBe(0);
    const s1 = stopAt(1); // Zug bei Spieler 1 — der hat keinen Bahnhof
    expect(trainStopPlayer(s1, catalog)).toBeNull();
    const s2 = stopAt(2); // Tunnel-Segment
    expect(trainStopPlayer(s2, catalog)).toBeNull();
  });
});

describe('Eisenbahn: Verladen und Tauschen', () => {
  it('Verladen legt das Material in einen freien Waggon und ersetzt das Platzieren', () => {
    let s = stopAt(0);
    s = a(s, { t: 'trainDrop', player: 0 });
    expect(s.train!.wagons).toEqual(['wood', null, null]);
    expect(s.players[0].pending).toBeNull();
    s = a(s, { t: 'roundDone', player: 0 }); // ohne Platzieren erlaubt
    expect(s.players[0].roundDone).toBe(true);
  });

  it('Tauschen: Angesagtes in den Waggon, Waggon-Material wird platziert', () => {
    let s = stopAt(0);
    s.train!.wagons = ['glass', null, null];
    s = a(s, { t: 'trainSwap', player: 0, wagon: 0 });
    expect(s.train!.wagons).toEqual(['wood', null, null]);
    expect(s.players[0].pending).toBe('glass');
    s = a(s, { t: 'placeResource', player: 0, square: 3 });
    expect(s.players[0].board[3].resource).toBe('glass');
  });

  it('nur eine Zug-Aktion pro Halt', () => {
    let s = stopAt(0);
    s.train!.wagons = ['glass', null, null];
    s = a(s, { t: 'trainSwap', player: 0, wagon: 0 });
    expect(() => a(s, { t: 'trainDrop', player: 0 })).toThrow(RuleError);
    expect(() => a(s, { t: 'trainSwap', player: 0, wagon: 0 })).toThrow(RuleError);
  });

  it('Fehlerfälle: fremder Halt, volle Waggons, leerer Waggon, kein Zug', () => {
    const s1 = stopAt(1); // hält nicht bei Spieler 0
    expect(() => a(s1, { t: 'trainDrop', player: 0 })).toThrow('hält nicht an deinem Bahnhof');
    expect(() => a(s1, { t: 'trainDrop', player: 1 })).toThrow('hält nicht an deinem Bahnhof');

    const s2 = stopAt(0);
    s2.train!.wagons = ['glass', 'brick', 'stone'];
    expect(() => a(s2, { t: 'trainDrop', player: 0 })).toThrow('Alle Waggons sind voll');

    const s3 = stopAt(0);
    expect(() => a(s3, { t: 'trainSwap', player: 0, wagon: 1 })).toThrow('Dieser Waggon ist leer');
    expect(() => a(s3, { t: 'trainSwap', player: 0, wagon: 7 })).toThrow('Ungültiger Waggon');

    const s4 = inRound(newGame(baseConfig(2)), 'wood');
    expect(() => a(s4, { t: 'trainDrop', player: 0 })).toThrow('nicht im Spiel');
  });

  it('nach dem Tausch ist kein Fabrik-/Münztausch mehr möglich', () => {
    let s = stopAt(0);
    s.config.systems.coins = true;
    s.players[0].coins = 2;
    s.train!.wagons = ['glass', null, null];
    s = a(s, { t: 'trainSwap', player: 0, wagon: 0 });
    // pending ('glass') entspricht nicht mehr der Ansage ('wood') → Tausch gesperrt
    expect(() => a(s, { t: 'coinSwap', player: 0, take: 'brick' })).toThrow(RuleError);
  });
});

describe('Eisenbahn: Bahnhof-Regeln', () => {
  it('höchstens ein Bahnhof pro Stadt', () => {
    let s = newGame(trainConfig(2, 2));
    s = inRound(s, 'stone');
    put(s, 0, 0, 'train_station');
    s.players[0].board[4].resource = 'stone';
    s.players[0].board[5].resource = 'wood';
    s.players[0].board[6].resource = 'stone';
    expect(() =>
      a(s, { t: 'build', player: 0, squares: [4, 5, 6], card: 'train_station', target: 5 })
    ).toThrow('Nur ein Bahnhof pro Stadt');
  });

  it('Bahnhof ist baubar und zählt 2 Punkte', () => {
    let s = newGame(trainConfig(2, 2));
    s = inRound(s, 'stone');
    s.players[0].board[4].resource = 'stone';
    s.players[0].board[5].resource = 'wood';
    s.players[0].board[6].resource = 'stone';
    s = a(s, { t: 'build', player: 0, squares: [4, 5, 6], card: 'train_station', target: 5 });
    expect(s.players[0].board[5].building?.card).toBe('train_station');
    const score = scorePlayer(s, 0, catalog);
    const line = score.lines.find((l) => l.card === 'train_station');
    expect(line?.points).toBe(2);
  });

  it('Solo: Zyklus 3 — der Zug hält alle 3 Runden', () => {
    const cfg = trainConfig(1, 0);
    cfg.solo = true;
    const s = newGame(cfg);
    expect(trainCycle(s)).toBe(3);
    put(s, 0, 15, 'train_station');
    inRound(s, 'wood');
    expect(trainStopPlayer(s, catalog)).toBe(0);
    s.train!.pos = 1;
    expect(trainStopPlayer(s, catalog)).toBeNull();
    s.train!.pos = 2;
    expect(trainStopPlayer(s, catalog)).toBeNull();
  });
});
