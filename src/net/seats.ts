// Sitzplatzmodell: Jeder Platz wird entweder am Host-Gerät bedient (local) oder
// von einem eigenen Gerät (remote). Der Ein-Gerät-Modus ist der Fall „alle Plätze
// lokal, keine Sitzung aktiv".

import type { Action, GameState } from '../engine/types';
import type { PeerId } from './transport';
import type { SeatInfo } from './protocol';

export interface Seat {
  index: number;
  name: string;
  corner: number;
  kind: 'local' | 'remote';
  /** Stabile Gerätekennung (überlebt Verbindungsabbrüche). */
  clientId?: string;
  /** Aktuelle Verbindung; wechselt bei jedem Reconnect. */
  peerId?: PeerId;
  connected: boolean;
}

export function toSeatInfo(seats: Seat[]): SeatInfo[] {
  return seats.map((s) => ({
    index: s.index,
    name: s.name,
    corner: s.corner,
    kind: s.kind,
    connected: s.kind === 'local' ? true : s.connected
  }));
}

export function seatOfPeer(seats: Seat[], peer: PeerId): Seat | undefined {
  return seats.find((s) => s.peerId === peer);
}

export function seatOfClient(seats: Seat[], clientId: string): Seat | undefined {
  return seats.find((s) => s.clientId === clientId);
}

/**
 * Darf dieser Sitzplatz diese Aktion auslösen? Gibt bei Verstoß die Begründung
 * zurück, sonst null. Alle Aktionen außer `nameResource` tragen ihren Spieler
 * selbst; `nameResource` gilt implizit für den Baumeister.
 */
export function actionAllowed(action: Action, seat: number, state: GameState): string | null {
  if (action.t === 'nameResource') {
    return state.masterBuilder === seat ? null : 'Nur der Baumeister sagt das Material an';
  }
  return action.player === seat ? null : 'Diese Aktion gehört zu einem anderen Spielplatz';
}
