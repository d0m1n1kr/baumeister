// Der Tages-Challenge-Vertrag: Gleicher Tag ⇒ weltweit gleiche Auslage —
// über App-Versionen hinweg. Diese Snapshots wurden VOR der Parametrisierung
// der Brettgeometrie (v2.16.0) festgehalten. Ändert irgendein Refactor die
// Zugreihenfolge des Seed-RNGs, weichen die Werte ab und dieser Test schlägt
// an, BEVOR ein Release die historischen Tageskarten umschreibt.
import { describe, expect, it } from 'vitest';
import { catalog } from '../data';
import { dailySeed, mulberry32, randomSetup } from './registry';

const GOLDEN: Record<string, { cards: string[]; mon: string[][]; deck: string[] }> = {
  '2026-08-27': {
    cards: ['cottage', 'granary', 'shed', 'cloister', 'market', 'tavern', 'trading_post'],
    mon: [['cathedral_of_caterina', 'the_sky_baths']],
    deck: ['glass','wheat','wood','glass','wood','brick','stone','brick','wood','wheat','glass','stone','stone','wheat','brick']
  },
  '2026-01-01': {
    cards: ['cottage', 'farm', 'shed', 'cloister', 'bakery', 'tavern', 'factory'],
    mon: [['the_sky_baths', 'barrett_castle']],
    deck: ['brick','glass','brick','stone','wood','wood','wheat','wheat','wheat','brick','stone','glass','stone','wood','glass']
  },
  '2025-12-31': {
    cards: ['cottage', 'granary', 'millstone', 'chapel', 'market', 'tavern', 'trading_post'],
    mon: [['mandras_palace', 'grand_mausoleum_of_the_rodina']],
    deck: ['stone','wheat','wood','wood','glass','brick','brick','brick','wood','glass','wheat','glass','stone','stone','wheat']
  }
};

describe('Tages-Challenge bleibt über Versionen stabil', () => {
  for (const [day, want] of Object.entries(GOLDEN)) {
    it(`Solo-Auslage vom ${day} ist eingefroren`, () => {
      const cfg = randomSetup(
        catalog,
        [{ name: 'Solo', corner: 0 }],
        true,
        mulberry32(dailySeed(day)),
        ['base'],
        {},
        true
      );
      expect(cfg.activeCards).toEqual(want.cards);
      expect(cfg.monumentDeals).toEqual(want.mon);
      expect(cfg.soloDeck).toEqual(want.deck);
    });
  }
});
