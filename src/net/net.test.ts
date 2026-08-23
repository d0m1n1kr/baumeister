import { describe, it, expect } from 'vitest';
import { HIDDEN_MONUMENT, redactFor } from './redact';
import { actionAllowed, toSeatInfo, type Seat } from './seats';
import { isValidRoomCode, makeRoomCode, normalizeRoomCode } from './protocol';
import { LoopbackNetwork } from './loopback';
import { catalog, freshGame } from '../engine/test-helpers';
import { mulberry32, randomSetup } from '../engine/registry';
import type { GameState } from '../engine/types';

function gameWithMonuments(): GameState {
  const s = freshGame(3, undefined, true, [
    ['the_starloom', 'mandras_palace'],
    ['cathedral_of_caterina', 'silva_forum'],
    ['grove_university', 'fort_ironweed']
  ]);
  s.players[0].monument = { card: 'the_starloom', built: false };
  s.players[1].monument = { card: 'silva_forum', built: false };
  s.players[2].monument = { card: 'fort_ironweed', built: true };
  return s;
}

describe('Geheimhaltung fremder Monumente', () => {
  it('verbirgt fremde, ungebaute Monumente — das eigene bleibt sichtbar', () => {
    const view = redactFor(gameWithMonuments(), 0);
    expect(view.players[0].monument?.card).toBe('the_starloom');
    expect(view.players[1].monument?.card).toBe(HIDDEN_MONUMENT);
  });

  it('deckt gebaute Monumente auf (sie liegen offen auf dem Brett)', () => {
    const view = redactFor(gameWithMonuments(), 0);
    expect(view.players[2].monument).toEqual({ card: 'fort_ironweed', built: true });
  });

  it('verbirgt auch die Draft-Optionen und die Auslosung in der Konfiguration', () => {
    const s = gameWithMonuments();
    s.players[1].monumentOptions = ['cathedral_of_caterina', 'silva_forum'];
    const view = redactFor(s, 0);
    expect(view.players[1].monumentOptions).toEqual([HIDDEN_MONUMENT, HIDDEN_MONUMENT]);
    expect(view.config.monumentDeals[1]).toEqual([HIDDEN_MONUMENT, HIDDEN_MONUMENT]);
    expect(view.config.monumentDeals[0]).toEqual(['the_starloom', 'mandras_palace']);
  });

  it('lässt kein fremdes Monument irgendwo im übertragenen Zustand zurück', () => {
    const wire = JSON.stringify(redactFor(gameWithMonuments(), 0));
    for (const secret of ['silva_forum', 'cathedral_of_caterina', 'grove_university']) {
      expect(wire, secret).not.toContain(secret);
    }
  });

  it('sendet am Spielende ungefiltert', () => {
    const s = gameWithMonuments();
    s.phase = { t: 'gameOver' };
    expect(redactFor(s, 0).players[1].monument?.card).toBe('silva_forum');
  });

  it('die Rückseite ist eine echte Karte, wird aber nie ausgeteilt', () => {
    expect(catalog[HIDDEN_MONUMENT]).toBeDefined();
    expect(catalog[HIDDEN_MONUMENT].set).toBe('internal');

    const players = [0, 1, 2, 3].map((i) => ({ name: `P${i}`, corner: i }));
    for (let seed = 0; seed < 30; seed++) {
      const cfg = randomSetup(catalog, players, true, mulberry32(seed), ['base', 'fortune'], {
        coins: true
      });
      expect(cfg.activeCards).not.toContain(HIDDEN_MONUMENT);
      expect(cfg.monumentDeals.flat()).not.toContain(HIDDEN_MONUMENT);
    }
  });
});

describe('Besitzprüfung', () => {
  const state = freshGame(3);
  state.masterBuilder = 1;

  it('erlaubt nur Aktionen für den eigenen Platz', () => {
    expect(actionAllowed({ t: 'placeResource', player: 2, square: 0 }, 2, state)).toBeNull();
    expect(actionAllowed({ t: 'placeResource', player: 0, square: 0 }, 2, state)).toMatch(/anderen/);
  });

  it('lässt nur den Baumeister ansagen', () => {
    expect(actionAllowed({ t: 'nameResource', resource: 'wood' }, 1, state)).toBeNull();
    expect(actionAllowed({ t: 'nameResource', resource: 'wood' }, 2, state)).toMatch(/Baumeister/);
  });
});

describe('Raum-Code', () => {
  it('erzeugt gültige, gut lesbare Codes', () => {
    for (let seed = 0; seed < 50; seed++) {
      const code = makeRoomCode(mulberry32(seed));
      expect(code).toHaveLength(6);
      expect(isValidRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OIL]/); // verwechselbare Zeichen ausgeschlossen
    }
  });

  it('normalisiert Eingaben', () => {
    expect(normalizeRoomCode(' ab-c2 3d ')).toBe('ABC23D');
    expect(isValidRoomCode(normalizeRoomCode('abc'))).toBe(false);
  });
});

describe('Sitzplatz-Infos', () => {
  it('meldet lokale Plätze immer als verbunden', () => {
    const seats: Seat[] = [
      { index: 0, name: 'A', corner: 0, kind: 'local', connected: false },
      { index: 1, name: 'B', corner: 1, kind: 'remote', connected: false }
    ];
    const info = toSeatInfo(seats);
    expect(info[0].connected).toBe(true);
    expect(info[1].connected).toBe(false);
  });
});

describe('Loopback-Transport', () => {
  it('stellt Nachrichten zu, gezielt und an alle', () => {
    const net = new LoopbackNetwork();
    const received: Record<string, unknown[]> = { host: [], a: [], b: [] };
    const joins: Record<string, string[]> = { host: [], a: [], b: [] };
    const mk = (id: string) =>
      net.connect(id, {
        onMessage: (m) => received[id].push(m),
        onPeerJoin: (p) => joins[id].push(p),
        onPeerLeave: () => {}
      });

    const host = mk('host');
    const a = mk('a');
    const b = mk('b');

    expect(joins.host).toEqual(['a', 'b']);
    expect(joins.a).toEqual(['host', 'b']);

    host.send({ t: 'lobby' });
    expect(received.a).toEqual([{ t: 'lobby' }]);
    expect(received.b).toEqual([{ t: 'lobby' }]);

    host.send({ t: 'welcome', seat: 1 }, 'a');
    expect(received.a).toHaveLength(2);
    expect(received.b).toHaveLength(1);

    a.send({ t: 'action' });
    expect(received.host).toEqual([{ t: 'action' }]);
    void b;
  });

  it('bildet Verbindungsabbruch und Rückkehr ab', () => {
    const net = new LoopbackNetwork();
    const events: string[] = [];
    net.connect('host', {
      onMessage: () => events.push('msg'),
      onPeerJoin: (p) => events.push(`join:${p}`),
      onPeerLeave: (p) => events.push(`leave:${p}`)
    });
    const guest = net.connect('g1', {
      onMessage: () => {},
      onPeerJoin: () => {},
      onPeerLeave: () => {}
    });

    net.goOffline('g1');
    guest.send({ t: 'action' }); // getrennt: darf nicht ankommen
    net.goOnline('g1');

    expect(events).toEqual(['join:g1', 'leave:g1', 'join:g1']);
  });
});
