// Die Tages-Challenge muss weltweit DIESELBE Partie sein. Lokale Häkchen
// dürfen sie deshalb nicht verändern — und das ist keine Kosmetik: Schon das
// Abschalten der Monumente verschob früher den RNG-Lauf und damit das
// Material-Deck, Erweiterungen zogen ganz andere Karten.
import { describe, expect, it } from 'vitest';
import { buildGameConfig } from './newGameConfig';
import { catalog } from '../data';

const SPIELER = [{ name: 'S', corner: 0 }];
const TAG = '2026-08-27';

/** Alles, was die Partie ausmacht — ohne die partiespezifische gameId. */
const kern = (c: ReturnType<typeof buildGameConfig>) => ({
  activeCards: c.activeCards,
  monumentDeals: c.monumentDeals,
  soloDeck: c.soloDeck,
  firstMasterBuilder: c.firstMasterBuilder,
  systems: c.systems,
  townHall: c.townHall,
  terrain: c.terrain,
  sets: c.sets
});

describe('Tages-Challenge spielt pur', () => {
  const pur = buildGameConfig(SPIELER, ['base'], true, false, { solo: true, dailyId: TAG });

  it('Erweiterungen ändern die Tageskarte nicht', () => {
    const mit = buildGameConfig(SPIELER, ['base', 'fortune', 'tiny_trees'], true, false, {
      solo: true, dailyId: TAG
    });
    expect(kern(mit)).toEqual(kern(pur));
    expect(mit.sets).toEqual(['base']);
    expect(mit.systems.coins).toBe(false);
    expect(mit.systems.trees).toBe(false);
    expect(mit.activeCards.every((id) => catalog[id].set === 'base')).toBe(true);
  });

  it('abgeschaltete Monumente ändern die Tageskarte nicht', () => {
    // Der eigentliche Stolperstein: ohne Monumente zieht der Monument-Stapel
    // nicht, und alles danach (Material-Deck, Baumeister) verschiebt sich.
    const ohne = buildGameConfig(SPIELER, ['base'], false, false, { solo: true, dailyId: TAG });
    expect(kern(ohne)).toEqual(kern(pur));
    expect(ohne.useMonuments).toBe(true);
    expect(ohne.monumentDeals[0]).toHaveLength(2);
  });

  it('Eisenbahn, Rathaus und Höhle bleiben in der Challenge aus', () => {
    const mit = buildGameConfig(SPIELER, ['base'], true, true, {
      solo: true, dailyId: TAG, townHall: true, train: true
    });
    expect(kern(mit)).toEqual(kern(pur));
    expect(mit.systems.train).toBe(false);
    expect(mit.systems.cavern).toBe(false);
    expect(mit.townHall).toBeUndefined();
    expect(mit.activeCards).not.toContain('train_station');
  });

  it('die Landpartie bleibt erlaubt — sie ist das Brett, nicht eine Erweiterung', () => {
    const landpartie = buildGameConfig(SPIELER, ['base', 'fortune'], true, false, {
      solo: true, dailyId: TAG, land: true, train: true
    });
    expect(landpartie.land).toBe(true);
    expect(landpartie.terrain?.length).toBeGreaterThan(0);
    // pur: 7 + 3 Anlieger, kein Bahnhof, keine Münzen
    expect(landpartie.activeCards).toHaveLength(10);
    expect(landpartie.systems.coins).toBe(false);
    expect(landpartie.systems.train).toBe(false);
    // und immer noch derselbe Tag wie eine pur gestartete Landpartie-Challenge
    const nochmal = buildGameConfig(SPIELER, ['base'], true, false, {
      solo: true, dailyId: TAG, land: true
    });
    expect(kern(landpartie)).toEqual(kern(nochmal));
  });

  it('Gegenprobe: ohne dailyId wirken die Häkchen wie gewohnt', () => {
    const frei = buildGameConfig(SPIELER, ['base', 'fortune'], false, true, {
      solo: true, townHall: true, train: true
    });
    expect(frei.sets).toEqual(['base', 'fortune']);
    expect(frei.systems.coins).toBe(true);
    expect(frei.systems.cavern).toBe(true);
    expect(frei.systems.train).toBe(true);
    expect(frei.useMonuments).toBe(false);
  });
});
