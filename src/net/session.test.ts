import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clientId, Session, type GameBridge, type NetBridgeLike } from './session.svelte';
import { LoopbackNetwork } from './loopback';
import { HIDDEN_MONUMENT } from './redact';
import type { Seat } from './seats';
import { PROTOCOL_VERSION, type ClientMessage } from './protocol';
import { apply, newGame, RuleError } from '../engine/game';
import { catalog, config } from '../engine/test-helpers';
import type { Action, GameConfig, GameState } from '../engine/types';
import type { TransportFactory } from './transport';

/** Eigenständiger Spielzustand je Gerät (statt des App-Singletons). */
function fakeGame(bridge: NetBridgeLike): GameBridge {
  let state: GameState | null = null;
  return {
    get state() {
      return state;
    },
    start(cfg: GameConfig) {
      state = newGame(cfg);
    },
    dispatch(action: Action) {
      if (bridge.sendAction) {
        bridge.sendAction(action);
        return null;
      }
      if (!state) return 'Kein laufendes Spiel';
      try {
        state = apply(state, action, catalog);
        bridge.onLocalApplied?.();
        return null;
      } catch (e) {
        if (e instanceof RuleError) return e.message;
        throw e;
      }
    },
    setRemoteState(next: GameState) {
      state = next;
    }
  };
}

interface Device {
  session: Session;
  game: GameBridge;
  bridge: NetBridgeLike;
}

function device(): Device {
  const bridge: NetBridgeLike = { sendAction: null, onLocalApplied: null };
  const game = fakeGame(bridge);
  return { session: new Session(game, bridge), game, bridge };
}

const ACTIVE = ['cottage', 'farm', 'well', 'chapel', 'theater', 'tavern', 'factory'];

function seats(): Seat[] {
  return [
    { index: 0, name: 'Host', corner: 0, kind: 'local', connected: true },
    { index: 1, name: '—', corner: 3, kind: 'remote', connected: false },
    { index: 2, name: '—', corner: 2, kind: 'remote', connected: false }
  ];
}

function gameConfig(): GameConfig {
  const cfg = config(3, ACTIVE, true, [
    ['the_starloom', 'mandras_palace'],
    ['cathedral_of_caterina', 'silva_forum'],
    ['grove_university', 'fort_ironweed']
  ]);
  cfg.players = [
    { name: 'Host', corner: 0 },
    { name: 'Gast 1', corner: 3 },
    { name: 'Gast 2', corner: 2 }
  ];
  return cfg;
}

describe('Sitzung: Host und Gäste', () => {
  let net: LoopbackNetwork;
  let host: Device;
  let g1: Device;
  let g2: Device;
  let factory: (id: string) => TransportFactory;

  beforeEach(async () => {
    net = new LoopbackNetwork();
    host = device();
    g1 = device();
    g2 = device();
    factory = (id) => async (_code, handlers) => net.connect(id, handlers);

    await host.session.openRoom('ABC234', seats(), factory('host'));
    await g1.session.join('ABC234', 'Anna', factory('g1'), 'client-1');
    await g2.session.join('ABC234', 'Ben', factory('g2'), 'client-2');
  });

  it('teilt beitretenden Gästen Plätze zu', () => {
    expect(g1.session.mySeat).toBe(1);
    expect(g2.session.mySeat).toBe(2);
    expect(host.session.seats[1].name).toBe('Anna');
    expect(host.session.seats[1].connected).toBe(true);
    expect(g1.session.status).toBe('lobby');
  });

  it('verteilt den Zustand beim Spielstart — geheime Monumente gefiltert', () => {
    host.session.startGame(gameConfig());

    expect(g1.game.state).not.toBeNull();
    expect(g1.game.state!.players[1].monumentOptions).toEqual([
      'cathedral_of_caterina',
      'silva_forum'
    ]);
    // fremde Optionen sind verdeckt
    expect(g1.game.state!.players[0].monumentOptions).toEqual([HIDDEN_MONUMENT, HIDDEN_MONUMENT]);
    expect(JSON.stringify(g1.game.state)).not.toContain('grove_university');
  });

  it('spielt eine volle Runde über alle Geräte', () => {
    host.session.startGame(gameConfig());
    // Monument-Draft: jeder wählt
    host.game.dispatch({ t: 'chooseMonument', player: 0, card: 'the_starloom' });
    g1.game.dispatch({ t: 'chooseMonument', player: 1, card: 'silva_forum' });
    g2.game.dispatch({ t: 'chooseMonument', player: 2, card: 'fort_ironweed' });
    expect(host.game.state!.phase.t).toBe('nameResource');

    // Baumeister (Platz 0 = Host) sagt an
    host.game.dispatch({ t: 'nameResource', resource: 'wood' });
    expect(g1.game.state!.phase).toEqual({ t: 'round', resource: 'wood' });

    // alle platzieren von ihrem Gerät aus
    host.game.dispatch({ t: 'placeResource', player: 0, square: 0 });
    g1.game.dispatch({ t: 'placeResource', player: 1, square: 5 });
    g2.game.dispatch({ t: 'placeResource', player: 2, square: 10 });

    expect(host.game.state!.players[1].board[5].resource).toBe('wood');
    expect(g1.game.state!.players[2].board[10].resource).toBe('wood');
    expect(g2.game.state!.players[0].board[0].resource).toBe('wood');
  });

  it('weist Aktionen für fremde Plätze zurück', () => {
    host.session.startGame(gameConfig());
    g1.game.dispatch({ t: 'chooseMonument', player: 2, card: 'fort_ironweed' });
    expect(g1.session.netError).toMatch(/anderen Spielplatz/);
    expect(host.game.state!.players[2].monument).toBeUndefined();
  });

  it('lässt nur den Baumeister ansagen', () => {
    host.session.startGame(gameConfig());
    for (const [i, d] of [host, g1, g2].entries()) {
      d.game.dispatch({ t: 'chooseMonument', player: i, card: gameConfig().monumentDeals[i][0] });
    }
    g1.game.dispatch({ t: 'nameResource', resource: 'glass' });
    expect(g1.session.netError).toMatch(/Baumeister/);
    expect(host.game.state!.phase.t).toBe('nameResource');
  });

  it('meldet Regelverstöße an den auslösenden Gast zurück', () => {
    host.session.startGame(gameConfig());
    for (const [i, d] of [host, g1, g2].entries()) {
      d.game.dispatch({ t: 'chooseMonument', player: i, card: gameConfig().monumentDeals[i][0] });
    }
    host.game.dispatch({ t: 'nameResource', resource: 'wood' });
    g1.game.dispatch({ t: 'placeResource', player: 1, square: 5 });
    g1.session.clearError();
    g1.game.dispatch({ t: 'placeResource', player: 1, square: 6 }); // nichts mehr in der Hand
    expect(g1.session.netError).toMatch(/Kein Material/);
    expect(g2.session.netError).toBe(''); // andere bekommen den Fehler nicht
  });

  it('hält den Platz bei Verbindungsverlust frei und synchronisiert bei Rückkehr', () => {
    host.session.startGame(gameConfig());
    host.game.dispatch({ t: 'chooseMonument', player: 0, card: 'the_starloom' });

    net.goOffline('g1');
    expect(host.session.seats[1].connected).toBe(false);
    expect(host.session.seats[1].clientId).toBe('client-1'); // Reservierung bleibt

    // Während der Abwesenheit geht es weiter
    g2.game.dispatch({ t: 'chooseMonument', player: 2, card: 'fort_ironweed' });
    expect(host.game.state!.players[2].monument?.card).toBe('fort_ironweed');
    expect(g1.game.state!.players[2].monument).toBeUndefined(); // Gast hat es verpasst

    net.goOnline('g1');
    g1.session.requestResync();
    expect(host.session.seats[1].connected).toBe(true);
    expect(g1.session.mySeat).toBe(1);
    // Stand ist nachgeführt — die Wahl bleibt aber geheim
    expect(g1.game.state!.players[2].monument?.card).toBe(HIDDEN_MONUMENT);
    expect(g1.game.state!.players[2].monumentOptions).toBeUndefined();
  });

  it('weist Geräte mit abweichender Protokollversion ab', () => {
    const other = device();
    let sent: ClientMessage | null = null;
    const transport = net.connect('g3', {
      onMessage: (m) => {
        sent = m as ClientMessage;
      },
      onPeerJoin: () => {},
      onPeerLeave: () => {}
    });
    transport.send({
      t: 'hello',
      clientId: 'client-3',
      name: 'Alt',
      protocolVersion: PROTOCOL_VERSION + 1
    } satisfies ClientMessage);
    expect(sent).toMatchObject({ t: 'reject' });
    expect((sent as unknown as { reason: string }).reason).toMatch(/aktualisieren/);
    void other;
  });

  it('weist zusätzliche Geräte ab, wenn kein Platz frei ist', async () => {
    const g3 = device();
    await g3.session.join('ABC234', 'Clara', factory('g3'), 'client-3');
    expect(g3.session.status).toBe('error');
    expect(g3.session.netError).toMatch(/Kein freier Platz/);
  });

  it('erlaubt dem Host, einen Platz zu übernehmen', () => {
    host.session.startGame(gameConfig());
    host.session.takeOverSeat(1);
    expect(host.session.seats[1].kind).toBe('local');
    expect(host.session.controls(1)).toBe(true);
    expect(host.session.controls(2)).toBe(false);
  });

  it('übernimmt einen getrennten Platz mitten im Spiel — der alte Gast bleibt draußen', () => {
    host.session.startGame(gameConfig());
    net.goOffline('g1');
    expect(host.session.seats[1].connected).toBe(false);

    host.session.takeOverSeat(1);
    expect(host.session.controls(1)).toBe(true);

    // Der frühere Gast hat seine Reservierung verloren und erfährt das auch
    net.goOnline('g1');
    g1.session.requestResync();
    expect(g1.session.status).toBe('error');
    expect(g1.session.netError).toMatch(/übernommen/);
  });

  it('ignoriert Host-Nachrichten, die nicht vom Host stammen', () => {
    host.session.startGame(gameConfig());
    const before = JSON.stringify(g1.game.state);
    const fake = JSON.parse(before) as GameState;
    fake.players[0].name = 'GEKAPERT';

    const evil = net.connect('evil', {
      onMessage: () => {},
      onPeerJoin: () => {},
      onPeerLeave: () => {}
    });
    evil.send({ t: 'error', message: 'Böse Nachricht' }, 'g1');
    evil.send({ t: 'lobby', seats: [] }, 'g1');
    evil.send({ t: 'welcome', seat: 0, protocolVersion: PROTOCOL_VERSION }, 'g1');
    evil.send({ t: 'state', state: fake, version: 999 }, 'g1');

    expect(g1.session.netError).toBe('');
    expect(g1.session.mySeat).toBe(1);
    expect(g1.session.lobbySeats.length).toBe(3);
    expect(g1.game.state!.players[0].name).toBe('Host');
  });

  it('übersteht kaputte und werfende Nachrichten — Fehler geht an den Absender', async () => {
    const net2 = new LoopbackNetwork();
    const bridge: NetBridgeLike = { sendAction: null, onLocalApplied: null };
    const state = newGame(gameConfig());
    const boom: GameBridge = {
      get state() {
        return state;
      },
      start() {},
      dispatch() {
        throw new Error('Engine kaputt'); // kein RuleError → früher riss das den Host mit
      },
      setRemoteState() {}
    };
    const h = new Session(boom, bridge);
    await h.openRoom('XYZ234', seats(), async (_c, hd) => net2.connect('host', hd));

    const received: Array<{ t: string }> = [];
    const evil = net2.connect('e', {
      onMessage: (m) => received.push(m as { t: string }),
      onPeerJoin: () => {},
      onPeerLeave: () => {}
    });
    // Unbrauchbare Nachrichten werden kommentarlos verworfen (kein Absturz)
    evil.send('quatsch');
    evil.send({ t: 'action' });
    evil.send({ t: 'resync' });
    evil.send({ t: 'hello', clientId: 42 });

    evil.send({ t: 'hello', clientId: 'ce', name: 'E', protocolVersion: PROTOCOL_VERSION });
    evil.send({ t: 'action', action: { t: 'chooseMonument', player: 1, card: 'x' } });
    expect(received.some((m) => m.t === 'error')).toBe(true);
    // Der Host lebt weiter und beantwortet die nächste Anfrage noch
    evil.send({ t: 'resync', clientId: 'ce', lastSeen: -1 });
    expect(received.filter((m) => m.t === 'state').length).toBeGreaterThan(0);
  });

  it('schickt bei unverändertem Stand keinen Zustand erneut (Heartbeat bleibt still)', () => {
    host.session.startGame(gameConfig());
    let applied = 0;
    const orig = g1.game.setRemoteState.bind(g1.game);
    g1.game.setRemoteState = (next: GameState) => {
      applied++;
      orig(next);
    };

    g1.session.requestResync();
    g1.session.requestResync();
    expect(applied).toBe(0); // Gast war schon auf Stand

    host.game.dispatch({ t: 'chooseMonument', player: 0, card: 'the_starloom' });
    expect(applied).toBe(1);

    g1.session.requestResync();
    expect(applied).toBe(1); // wieder auf Stand — Host schweigt
  });

  it('bricht den Beitritt ab, wenn sich kein Host meldet', async () => {
    const net2 = new LoopbackNetwork();
    const d = device();
    await d.session.join('QQQ234', 'X', async (_c, hd) => net2.connect('solo', hd), 'cx', 20);
    expect(d.session.status).toBe('connecting'); // Raum betreten, aber niemand da
    await new Promise((r) => setTimeout(r, 60));
    expect(d.session.role).toBe('off');
    expect(d.session.netError).toMatch(/Kein Host/);
  });

  it('schließt einen Transport, der erst nach leave() fertig wird', async () => {
    const net2 = new LoopbackNetwork();
    const events: string[] = [];
    net2.connect('witness', {
      onMessage: () => {},
      onPeerJoin: (peer) => events.push(`join:${peer}`),
      onPeerLeave: (peer) => events.push(`leave:${peer}`)
    });

    const d = device();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const pending = d.session.join(
      'ABC234',
      'X',
      async (_c, hd) => {
        await gate;
        return net2.connect('late', hd);
      },
      'cx'
    );
    d.session.leave(); // Nutzer bricht ab, während die Fabrik noch arbeitet
    release();
    await pending;

    expect(d.session.role).toBe('off');
    expect(d.session.netError).toBe(''); // Abbruch ist kein Fehler
    expect(events).toEqual(['join:late', 'leave:late']); // Geister-Transport sofort geschlossen
  });

  it('scheitert openRoom sauber, wenn der Transport nicht zustande kommt', async () => {
    const d = device();
    await expect(
      d.session.openRoom('ABC234', seats(), async () => {
        throw new Error('Vermittlung nicht erreichbar');
      })
    ).rejects.toThrow(/nicht erreichbar/);
    expect(d.session.role).toBe('off'); // nichts halb-initialisiert
    expect(d.session.seats.length).toBe(0);
    expect(d.bridge.onLocalApplied).toBeNull();
  });
});

describe('Gerätekennung', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeStorage() {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      data
    };
  }

  it('liegt je Tab im sessionStorage, wenn der Tab-Transport aktiv ist', () => {
    const sess = fakeStorage();
    const local = fakeStorage();
    vi.stubGlobal('location', { search: '?transport=channel' });
    vi.stubGlobal('sessionStorage', sess);
    vi.stubGlobal('localStorage', local);

    const id = clientId();
    expect(clientId()).toBe(id); // stabil über Aufrufe
    expect(sess.data.size).toBe(1);
    expect(local.data.size).toBe(0); // sonst „wären" zwei Tabs dasselbe Gerät
  });

  it('liegt sonst im localStorage (überlebt Reloads des Geräts)', () => {
    const sess = fakeStorage();
    const local = fakeStorage();
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('sessionStorage', sess);
    vi.stubGlobal('localStorage', local);

    const id = clientId();
    expect(clientId()).toBe(id);
    expect(local.data.size).toBe(1);
    expect(sess.data.size).toBe(0);
  });
});

describe('Ein-Gerät-Modus', () => {
  it('bleibt unberührt: keine Umleitung, alle Plätze bedienbar', () => {
    const d = device();
    expect(d.session.role).toBe('off');
    expect(d.bridge.sendAction).toBeNull();
    expect(d.bridge.onLocalApplied).toBeNull();
    expect(d.session.controls(0)).toBe(true);
    expect(d.session.controls(3)).toBe(true);

    d.game.start(gameConfig());
    d.game.dispatch({ t: 'chooseMonument', player: 0, card: 'the_starloom' });
    expect(d.game.state!.players[0].monument?.card).toBe('the_starloom');
  });
});
