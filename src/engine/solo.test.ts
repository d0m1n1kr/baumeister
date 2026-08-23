import { describe, it, expect } from 'vitest';
import { apply, newGame, RuleError } from './game';
import { dailySeed, mulberry32, randomSetup, soloRank, SOLO_EXCLUDED } from './registry';
import { catalog, config, ACTIVE_DEFAULT } from './test-helpers';
import type { GameConfig, GameState, Resource } from './types';

const a = (s: GameState, action: Parameters<typeof apply>[1]) => apply(s, action, catalog);

/** Festes Deck für deterministische Tests: 3 je Material in bekannter Folge. */
const DECK: Resource[] = [
  'wood', 'brick', 'stone',
  'wheat', 'glass', 'wood',
  'brick', 'stone', 'wheat',
  'glass', 'wood', 'brick',
  'stone', 'wheat', 'glass'
];

function soloGame(): GameState {
  const cfg: GameConfig = config(1, ACTIVE_DEFAULT, false);
  cfg.solo = true;
  cfg.soloDeck = [...DECK];
  return newGame(cfg);
}

describe('Solo-Modus: Setup', () => {
  const player = [{ name: 'Ich', corner: 0 }];

  it('schließt die vier Mitspieler-Karten aus und mischt ein 15er-Deck', () => {
    for (let seed = 0; seed < 25; seed++) {
      const cfg = randomSetup(catalog, player, true, mulberry32(seed), ['base'], {}, true);
      for (const id of [...cfg.activeCards, ...cfg.monumentDeals.flat()]) {
        expect(SOLO_EXCLUDED, `Seed ${seed}: ${id}`).not.toContain(id);
      }
      expect(cfg.soloDeck).toHaveLength(15);
      for (const r of ['wood', 'brick', 'stone', 'wheat', 'glass']) {
        expect(cfg.soloDeck!.filter((x) => x === r)).toHaveLength(3);
      }
    }
  });

  it('ist über den Seed deterministisch (Tages-Challenge)', () => {
    const s1 = dailySeed('2026-08-23');
    expect(dailySeed('2026-08-23')).toBe(s1);
    expect(dailySeed('2026-08-24')).not.toBe(s1);
    const c1 = randomSetup(catalog, player, true, mulberry32(s1), ['base'], {}, true);
    const c2 = randomSetup(catalog, player, true, mulberry32(s1), ['base'], {}, true);
    expect(c1.activeCards).toEqual(c2.activeCards);
    expect(c1.soloDeck).toEqual(c2.soloDeck);
  });
});

describe('Solo-Modus: Deck und Auslage', () => {
  it('legt 3 Karten aus, wählen rotiert die Karte unter den Stapel', () => {
    let s = soloGame();
    expect(s.soloOffer).toEqual(['wood', 'brick', 'stone']);
    expect(s.soloDeck).toHaveLength(12);

    s = a(s, { t: 'soloPick', index: 1 }); // Ziegel
    expect(s.players[0].pending).toBe('brick');
    expect(s.phase).toEqual({ t: 'round', resource: 'brick' });
    // Nachgezogen von oben (wheat), Gewähltes liegt jetzt ganz unten
    expect(s.soloOffer).toEqual(['wood', 'wheat', 'stone']);
    expect(s.soloDeck).toHaveLength(12);
    expect(s.soloDeck!.at(-1)).toBe('brick');

    // Materialbestand bleibt erhalten: immer 3 je Sorte über Auslage+Stapel
    const all = [...s.soloOffer!, ...s.soloDeck!];
    for (const r of ['wood', 'brick', 'stone', 'wheat', 'glass']) {
      expect(all.filter((x) => x === r)).toHaveLength(3);
    }
  });

  it('spielt eine volle Runde: wählen → platzieren → fertig → neue Wahl', () => {
    let s = soloGame();
    s = a(s, { t: 'soloPick', index: 0 });
    s = a(s, { t: 'placeResource', player: 0, square: 5 });
    s = a(s, { t: 'roundDone', player: 0 });
    expect(s.phase.t).toBe('nameResource');
    expect(s.masterBuilder).toBe(0); // bleibt immer derselbe
    expect(s.soloOffer).toHaveLength(3);
  });

  it('weist ungültige Wahlen zurück', () => {
    const s = soloGame();
    expect(() => a(s, { t: 'soloPick', index: 5 })).toThrow(RuleError);
    const normal = newGame(config(2));
    normal.phase = { t: 'nameResource' };
    expect(() => a(normal, { t: 'soloPick', index: 0 })).toThrow(/Kein Solo/);
  });

  it('Fabrik wirkt im Solo auch für die eigene Wahl (offizielle Regel)', () => {
    let s = soloGame();
    s.players[0].board[15].building = { card: 'factory', marked: 'wood' };
    s = a(s, { t: 'soloPick', index: 0 }); // Holz — auf der Fabrik markiert
    s = a(s, { t: 'factorySwap', player: 0, take: 'glass' });
    expect(s.players[0].pending).toBe('glass');
  });
});

describe('Solo-Modus: Rangtabelle', () => {
  it('entspricht der offiziellen Tabelle', () => {
    expect(soloRank(40)).toBe('Meister-Architekt');
    expect(soloRank(38)).toBe('Meister-Architekt');
    expect(soloRank(37)).toBe('Stadtplaner');
    expect(soloRank(32)).toBe('Stadtplaner');
    expect(soloRank(31)).toBe('Ingenieur');
    expect(soloRank(25)).toBe('Ingenieur');
    expect(soloRank(24)).toBe('Zimmermann');
    expect(soloRank(18)).toBe('Zimmermann');
    expect(soloRank(17)).toBe('Baulehrling');
    expect(soloRank(10)).toBe('Baulehrling');
    expect(soloRank(9)).toBe('Angehender Architekt');
    expect(soloRank(-3)).toBe('Angehender Architekt');
  });
});
