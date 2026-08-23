// Sitzungslogik für den Mehrgerätemodus.
//
// Rollenmodell: Der Host führt die Spiel-Engine und ist die Regelinstanz. Gäste
// schicken nur Absichten und rendern den empfangenen Zustand. Der Ein-Gerät-Modus
// entspricht `role === 'off'` — dann läuft kein Zeilchen Netzwerkcode.
//
// Spielzustand und Netz-Anbindung werden hereingereicht (statt importiert), damit
// in Tests ein Host und mehrere Gäste unabhängig im selben Prozess laufen können.

import { game, netBridge } from '../store/gameStore.svelte';
import type { Action, GameConfig, GameState } from '../engine/types';
import {
  PROTOCOL_VERSION, isClientMessage, isHostMessage,
  type ClientMessage, type HostMessage, type SeatInfo
} from './protocol';
import { redactFor } from './redact';
import { actionAllowed, seatOfClient, seatOfPeer, toSeatInfo, type Seat } from './seats';
import type { PeerId, Transport, TransportFactory } from './transport';

export type Role = 'off' | 'host' | 'guest';
export type Status = 'idle' | 'connecting' | 'lobby' | 'playing' | 'error';

/** Was die Sitzung vom Spielzustand braucht. */
export interface GameBridge {
  readonly state: GameState | null;
  start(config: GameConfig): void;
  dispatch(action: Action): string | null;
  setRemoteState(state: GameState): void;
}

/** Umleitung der UI-Aktionen (siehe `netBridge` in gameStore.svelte.ts). */
export interface NetBridgeLike {
  sendAction: ((action: Action) => void) | null;
  onLocalApplied: (() => void) | null;
}

const CLIENT_ID_KEY = 'tinytowns.clientId';

/** Stabile Gerätekennung — überlebt Verbindungsabbrüche und Reloads. */
export function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2);
  }
}

export class Session {
  role = $state<Role>('off');
  status = $state<Status>('idle');
  seats = $state<Seat[]>([]);
  lobbySeats = $state<SeatInfo[]>([]);
  mySeat = $state<number | null>(null);
  roomCode = $state('');
  netError = $state('');

  private transport: Transport | null = null;
  private hostPeer: PeerId | null = null;
  private version = 0;
  private lastSeenVersion = -1;
  private myName = '';
  private myClientId = '';
  /** Transporte melden Peers teils schon, bevor die Fabrik zurückgekehrt ist —
   *  solche Ereignisse werden bis zur Einsatzbereitschaft zurückgestellt. */
  private ready = false;
  private queued: Array<() => void> = [];

  private later(fn: () => void): void {
    if (this.ready) fn();
    else this.queued.push(fn);
  }

  private async connect(code: string, factory: TransportFactory, handlers: {
    onMessage(msg: unknown, from: PeerId): void;
    onPeerJoin(peer: PeerId): void;
    onPeerLeave(peer: PeerId): void;
  }): Promise<void> {
    this.ready = false;
    this.queued = [];
    this.transport = await factory(code, {
      onMessage: (msg, from) => this.later(() => handlers.onMessage(msg, from)),
      onPeerJoin: (peer) => this.later(() => handlers.onPeerJoin(peer)),
      onPeerLeave: (peer) => this.later(() => handlers.onPeerLeave(peer))
    });
    this.ready = true;
    const pending = this.queued;
    this.queued = [];
    for (const fn of pending) fn();
  }

  constructor(
    private readonly game: GameBridge,
    private readonly bridge: NetBridgeLike
  ) {}

  clearError(): void {
    this.netError = '';
  }

  /** Ist dieser Sitzplatz auf diesem Gerät bedienbar? */
  controls(seatIndex: number): boolean {
    if (this.role === 'off') return true;                    // Ein-Gerät-Modus: alle Plätze
    if (this.role === 'guest') return this.mySeat === seatIndex;
    return this.seats[seatIndex]?.kind === 'local';          // Host: seine lokalen Plätze
  }

  // ---------------- Host ----------------

  async openRoom(code: string, initialSeats: Seat[], factory: TransportFactory): Promise<void> {
    this.role = 'host';
    this.status = 'lobby';
    this.roomCode = code;
    this.seats = initialSeats;
    this.mySeat = initialSeats.find((s) => s.kind === 'local')?.index ?? null;
    this.bridge.sendAction = null;
    this.bridge.onLocalApplied = () => this.broadcastState();
    await this.connect(code, factory, {
      onMessage: (msg, from) => this.onClientMessage(msg, from),
      onPeerJoin: () => this.sendLobby(),
      onPeerLeave: (peer) => {
        const seat = seatOfPeer(this.seats, peer);
        if (seat) {
          // Platz bleibt reserviert — der Spieler kommt typischerweise zurück,
          // sobald er die App wieder in den Vordergrund holt.
          seat.connected = false;
          seat.peerId = undefined;
        }
        this.sendLobby();
      }
    });
    this.sendLobby();
  }

  startGame(config: GameConfig): void {
    this.game.start(config);
    this.status = 'playing';
    this.broadcastState();
  }

  broadcastState(): void {
    if (this.role !== 'host' || !this.transport) return;
    const state = this.game.state;
    if (!state) return;
    this.version++;
    for (const seat of this.seats) {
      if (seat.kind !== 'remote' || !seat.peerId) continue;
      const msg: HostMessage = {
        t: 'state',
        state: redactFor(state, seat.index),
        version: this.version
      };
      this.transport.send(msg, seat.peerId);
    }
  }

  /** Host übernimmt einen (z. B. dauerhaft getrennten) Platz selbst. */
  takeOverSeat(index: number): void {
    if (this.role !== 'host') return;
    const seat = this.seats[index];
    if (!seat) return;
    seat.kind = 'local';
    seat.peerId = undefined;
    seat.clientId = undefined;
    seat.connected = true;
    this.sendLobby();
  }

  // ---------------- Gast ----------------

  async join(
    code: string,
    name: string,
    factory: TransportFactory,
    id: string = clientId()
  ): Promise<void> {
    this.role = 'guest';
    this.status = 'connecting';
    this.roomCode = code;
    this.netError = '';
    this.lastSeenVersion = -1;
    this.myName = name;
    this.myClientId = id;
    this.bridge.sendAction = (action) => this.sendAction(action);
    this.bridge.onLocalApplied = null;
    await this.connect(code, factory, {
      onMessage: (msg, from) => this.onHostMessage(msg, from),
      onPeerJoin: (peer) => this.sendHello(peer),
      onPeerLeave: (peer) => {
        if (peer === this.hostPeer) {
          this.hostPeer = null;
          this.status = 'connecting';
        }
      }
    });
  }

  sendAction(action: Action): void {
    if (!this.transport) return;
    const msg: ClientMessage = { t: 'action', action };
    this.transport.send(msg, this.hostPeer ?? undefined);
  }

  /** Nach Rückkehr aus dem Hintergrund den vollen Zustand nachladen. */
  requestResync(): void {
    if (this.role !== 'guest' || !this.transport) return;
    if (this.hostPeer) {
      this.transport.send(
        { t: 'resync', clientId: this.myClientId } satisfies ClientMessage,
        this.hostPeer
      );
    } else {
      // Verbindung war weg: neu anmelden, der Host erkennt uns an der clientId
      this.transport.send({
        t: 'hello',
        clientId: this.myClientId,
        name: this.myName,
        protocolVersion: PROTOCOL_VERSION
      } satisfies ClientMessage);
    }
  }

  // ---------------- gemeinsam ----------------

  leave(): void {
    this.transport?.close();
    this.transport = null;
    this.hostPeer = null;
    this.role = 'off';
    this.status = 'idle';
    this.seats = [];
    this.lobbySeats = [];
    this.mySeat = null;
    this.roomCode = '';
    this.netError = '';
    this.version = 0;
    this.bridge.sendAction = null;
    this.bridge.onLocalApplied = null;
  }

  // ---------------- Nachrichtenbehandlung ----------------

  private sendLobby(): void {
    this.lobbySeats = toSeatInfo(this.seats);
    this.transport?.send({ t: 'lobby', seats: this.lobbySeats } satisfies HostMessage);
  }

  private sendHello(peer: PeerId): void {
    this.transport?.send(
      {
        t: 'hello',
        clientId: this.myClientId,
        name: this.myName,
        protocolVersion: PROTOCOL_VERSION
      } satisfies ClientMessage,
      peer
    );
  }

  private onClientMessage(raw: unknown, from: PeerId): void {
    const transport = this.transport;
    if (!transport || !isClientMessage(raw)) return;
    const reply = (msg: HostMessage) => transport.send(msg, from);

    switch (raw.t) {
      case 'hello': {
        if (raw.protocolVersion !== PROTOCOL_VERSION) {
          reply({ t: 'reject', reason: 'Unterschiedliche App-Version — bitte aktualisieren.' });
          return;
        }
        // Bekanntes Gerät? Dann seinen Platz zurückgeben (Wiederverbindung).
        let seat = seatOfClient(this.seats, raw.clientId);
        if (!seat) {
          seat = this.seats.find((s) => s.kind === 'remote' && !s.clientId);
          if (!seat) {
            reply({ t: 'reject', reason: 'Kein freier Platz in dieser Partie.' });
            return;
          }
          seat.clientId = raw.clientId;
          if (raw.name.trim()) seat.name = raw.name.trim().slice(0, 14);
        }
        seat.peerId = from;
        seat.connected = true;
        reply({ t: 'welcome', seat: seat.index, protocolVersion: PROTOCOL_VERSION });
        this.sendLobby();
        if (this.game.state) {
          this.version++;
          reply({ t: 'state', state: redactFor(this.game.state, seat.index), version: this.version });
        }
        return;
      }

      case 'action': {
        const seat = seatOfPeer(this.seats, from);
        if (!seat) {
          reply({ t: 'error', message: 'Kein Platz für dieses Gerät.' });
          return;
        }
        const state = this.game.state;
        if (!state) {
          reply({ t: 'error', message: 'Die Partie läuft noch nicht.' });
          return;
        }
        const denied = actionAllowed(raw.action, seat.index, state);
        if (denied) {
          reply({ t: 'error', message: denied });
          return;
        }
        // Regulär anwenden; der Broadcast läuft über bridge.onLocalApplied.
        const err = this.game.dispatch(raw.action);
        if (err) reply({ t: 'error', message: err });
        return;
      }

      case 'resync': {
        // Peer-Kennung wechselt bei jeder Verbindung; die Gerätekennung nicht.
        const seat = seatOfPeer(this.seats, from) ?? seatOfClient(this.seats, raw.clientId);
        if (!seat) return;
        if (seat.peerId !== from || !seat.connected) {
          seat.peerId = from;
          seat.connected = true;
          this.sendLobby();
        }
        if (!this.game.state) return;
        this.version++;
        reply({ t: 'state', state: redactFor(this.game.state, seat.index), version: this.version });
        return;
      }
    }
  }

  private onHostMessage(raw: unknown, from: PeerId): void {
    if (!isHostMessage(raw)) return;

    switch (raw.t) {
      case 'welcome':
        this.hostPeer = from;
        this.mySeat = raw.seat;
        this.status = this.game.state ? 'playing' : 'lobby';
        this.netError = '';
        return;
      case 'reject':
        this.hostPeer = null;
        this.status = 'error';
        this.netError = raw.reason;
        return;
      case 'lobby':
        this.hostPeer = from;
        this.lobbySeats = raw.seats;
        if (this.status === 'connecting') this.status = 'lobby';
        return;
      case 'state':
        if (raw.version <= this.lastSeenVersion) return; // veraltete Nachricht verwerfen
        this.lastSeenVersion = raw.version;
        this.hostPeer = from;
        this.game.setRemoteState(raw.state);
        this.status = 'playing';
        return;
      case 'error':
        this.netError = raw.message;
        return;
    }
  }
}

/** Sitzung der App (Ein-Gerät-Modus: bleibt schlicht unbenutzt). */
export const session = new Session(game, netBridge);
