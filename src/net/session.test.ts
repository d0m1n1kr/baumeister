import { describe, it, expect, beforeEach } from 'vitest';
import { Session, type GameBridge, type NetBridgeLike } from './session.svelte';
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
