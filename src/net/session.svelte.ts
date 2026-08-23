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

/** Wird geworfen, wenn `leave()` einen noch laufenden Verbindungsaufbau überholt. */
class ConnectAborted extends Error {
  constructor() {
    super('Verbindungsaufbau abgebrochen.');
  }
}

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

/**
 * Stabile Gerätekennung — überlebt Verbindungsabbrüche und Reloads.
 * Beim Tab-zu-Tab-Transport (`?transport=channel`) teilen sich alle Tabs
 * denselben localStorage; dort gilt die Kennung je Tab (sessionStorage),
 * sonst „wäre" jeder Tab dasselbe Gerät und bekäme denselben Platz.
 */
export function clientId(): string {
  try {
    const perTab = new URLSearchParams(location.search).get('transport') === 'channel';
    const store = perTab ? sessionStorage : localStorage;
    let id = store.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      store.setItem(CLIENT_ID_KEY, id);
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
  /** Vom Host beim Raumöffnen gewählte Partie-Optionen (Erweiterungen, Monumente). */
  setup = $state<{ sets: string[]; useMonuments: boolean }>({ sets: ['base'], useMonuments: true });

  private transport: Transport | null = null;
  private hostPeer: PeerId | null = null;
  private version = 0;
  private lastSeenVersion = -1;
  private myName = '';
  private myClientId = '';
  /** Zählt Verbindungsläufe: Kehrt eine Transport-Fabrik erst zurück, nachdem
   *  `leave()` (oder ein neuer Aufbau) lief, gehört ihr Ergebnis zu einem alten
   *  Lauf und wird geschlossen statt übernommen. */
  private epoch = 0;
  /** Frist für den Beitritt: Ein Raum lässt sich auch ohne Host „betreten"
   *  (z. B. bei einem Tippfehler im Code) — dann darf es kein ewiges Warten geben. */
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  /** Transporte melden Peers teils schon, bevor die Fabrik zurückgekehrt ist —
   *  solche Ereignisse werden bis zur Einsatzbereitschaft zurückgestellt. */
  private ready = false;
  private queued: Array<() => void> = [];

  private later(epoch: number, fn: () => void): void {
    if (epoch !== this.epoch) return; // Ereignis aus einem beendeten Lauf
    if (this.ready) fn();
    else this.queued.push(fn);
  }

  /**
   * Alles wird als schlichtes JSON verschickt: Reaktive Zustände sind Proxys,
   * die weder strukturiert geklont noch von Serialisierern verarbeitet werden können.
   */
  private post(msg: ClientMessage | HostMessage, target?: PeerId): void {
    this.transport?.send(JSON.parse(JSON.stringify(msg)), target);
  }

  private async connect(code: string, factory: TransportFactory, handlers: {
    onMessage(msg: unknown, from: PeerId): void;
    onPeerJoin(peer: PeerId): void;
    onPeerLeave(peer: PeerId): void;
  }): Promise<void> {
    const myEpoch = ++this.epoch;
    this.ready = false;
    this.queued = [];
    const transport = await factory(code, {
      onMessage: (msg, from) => this.later(myEpoch, () => handlers.onMessage(msg, from)),
      onPeerJoin: (peer) => this.later(myEpoch, () => handlers.onPeerJoin(peer)),
      onPeerLeave: (peer) => this.later(myEpoch, () => handlers.onPeerLeave(peer))
    });
    if (myEpoch !== this.epoch) {
      // Während des Aufbaus kam ein leave() oder ein neuer Aufbau dazwischen —
      // dieser Transport gehört niemandem mehr.
      transport.close();
      throw new ConnectAborted();
    }
    this.transport = transport;
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
    // Die Plätze müssen vor dem Verbinden stehen: `hello`-Nachrichten können
    // schon während des Aufbaus eintreffen (und werden bis dahin gepuffert).
    this.seats = initialSeats;
    try {
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
    } catch (e) {
      // Nichts halb-initialisiert zurücklassen: sauber zurück in den Ein-Gerät-Modus.
      this.leave();
      throw e;
    }
    // Erst nach erfolgreichem Aufbau wird dieses Gerät zum Host.
    this.role = 'host';
    this.status = 'lobby';
    this.roomCode = code;
    this.mySeat = initialSeats.find((s) => s.kind === 'local')?.index ?? null;
    this.bridge.sendAction = null;
    this.bridge.onLocalApplied = () => this.broadcastState();
    this.sendLobby();
  }

  startGame(config: GameConfig): void {
    this.game.start(config);
    this.status = 'playing';
    this.broadcastState();
  }

  /** Einzige Stelle, die die Zustandsversion erhöht — Antworten auf `hello`
   *  und `resync` schicken die aktuelle Version unverändert mit. */
  broadcastState(): void {
    if (this.role !== 'host' || !this.transport) return;
    const state = this.game.state;
    if (!state) return;
    this.version++;
    for (const seat of this.seats) {
      if (seat.kind !== 'remote' || !seat.peerId) continue;
      this.post({ t: 'state', state: redactFor(state, seat.index), version: this.version }, seat.peerId);
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
    id: string = clientId(),
    timeoutMs = 15000
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
    try {
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
    } catch (e) {
      if (e instanceof ConnectAborted) return; // leave() kam zuvor — nichts zu melden
      // Aufbau gescheitert (Vermittlung nicht erreichbar o. Ä.): sauber zurück;
      // die Meldung nach leave() setzen, weil leave() sie räumt.
      this.leave();
      this.netError = e instanceof Error && e.message ? e.message : 'Verbindung fehlgeschlagen.';
      return;
    }
    // Meldet sich binnen Frist kein Host (falscher Code, Host offline),
    // wird der Beitritt abgebrochen statt ewig zu „verbinden".
    this.clearJoinTimer();
    if (this.status !== 'connecting') return; // Host hat sich schon gemeldet
    this.joinTimer = setTimeout(() => {
      this.joinTimer = null;
      if (this.role !== 'guest' || this.status !== 'connecting') return;
      this.leave();
      this.netError = 'Kein Host unter diesem Code erreichbar — Code prüfen und erneut versuchen.';
    }, timeoutMs);
  }

  sendAction(action: Action): void {
    if (!this.transport) return;
    this.post({ t: 'action', action }, this.hostPeer ?? undefined);
  }

  /**
   * Nach Rückkehr in den Vordergrund aufrufen. Unter iOS wird die App im
   * Hintergrund angehalten und die Verbindung fällt weg — statt das zu
   * verhindern (was nicht geht), wird der Zustand einfach neu geholt.
   */
  onResume(): void {
    if (this.role === 'guest') this.requestResync();
    else if (this.role === 'host') this.sendLobby();
  }

  /** Regelmäßiger Abgleich, falls ein Verbindungsverlust unbemerkt bleibt.
   *  Nur Gäste fragen zyklisch nach; dank `lastSeen` antwortet der Host bei
   *  unverändertem Stand gar nicht — im Ruhezustand fließen keine Zustände. */
  startHeartbeat(intervalMs = 20000): () => void {
    const timer = setInterval(() => {
      if (this.role === 'guest') this.requestResync();
    }, intervalMs);
    return () => clearInterval(timer);
  }

  /** Nach Rückkehr aus dem Hintergrund den vollen Zustand nachladen. */
  requestResync(): void {
    if (this.role !== 'guest' || !this.transport) return;
    if (this.hostPeer) {
      this.post(
        { t: 'resync', clientId: this.myClientId, lastSeen: this.lastSeenVersion },
        this.hostPeer
      );
    } else {
      // Verbindung war weg: neu anmelden, der Host erkennt uns an der clientId
      this.post({
        t: 'hello',
        clientId: this.myClientId,
        name: this.myName,
        protocolVersion: PROTOCOL_VERSION
      });
    }
  }

  // ---------------- gemeinsam ----------------

  leave(): void {
    this.epoch++; // ein evtl. noch laufender Verbindungsaufbau gehört ab jetzt niemandem
    this.clearJoinTimer();
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

  private clearJoinTimer(): void {
    if (this.joinTimer !== null) {
      clearTimeout(this.joinTimer);
      this.joinTimer = null;
    }
  }

  // ---------------- Nachrichtenbehandlung ----------------

  private sendLobby(): void {
    const info = toSeatInfo(this.seats);
    this.lobbySeats = info;
    this.post({ t: 'lobby', seats: info });
  }

  private sendHello(peer: PeerId): void {
    this.post(
      {
        t: 'hello',
        clientId: this.myClientId,
        name: this.myName,
        protocolVersion: PROTOCOL_VERSION
      },
      peer
    );
  }

  /** Nachrichten kommen von fremden Geräten: Ein Fehler bei der Verarbeitung
   *  geht als Antwort an den Absender zurück, statt den Host mitzureißen. */
  private onClientMessage(raw: unknown, from: PeerId): void {
    if (!this.transport || !isClientMessage(raw)) return;
    try {
      this.handleClientMessage(raw, from);
    } catch (e) {
      this.post(
        { t: 'error', message: e instanceof Error ? e.message : 'Ungültige Nachricht.' },
        from
      );
    }
  }

  private handleClientMessage(raw: ClientMessage, from: PeerId): void {
    const reply = (msg: HostMessage) => this.post(msg, from);

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
        if (!seat) {
          // Platz wurde inzwischen übernommen (oder war nie vergeben) — dem
          // Gerät Bescheid geben statt es ewig weiterfragen zu lassen.
          reply({ t: 'reject', reason: 'Dein Platz wurde am Host-Gerät übernommen.' });
          return;
        }
        if (seat.peerId !== from || !seat.connected) {
          seat.peerId = from;
          seat.connected = true;
          this.sendLobby();
        }
        if (!this.game.state) return;
        if (raw.lastSeen >= this.version) return; // Gast ist auf Stand — nichts zu tun
        reply({ t: 'state', state: redactFor(this.game.state, seat.index), version: this.version });
        return;
      }
    }
  }

  private onHostMessage(raw: unknown, from: PeerId): void {
    if (!isHostMessage(raw)) return;
    // In einem Raum können auch andere Gäste (oder Fremde) senden: Als Host
    // gilt nur, wer uns per `welcome` aufgenommen hat — alle anderen Absender
    // werden für Host-Nachrichten ignoriert.
    const fromHost = this.hostPeer !== null && this.hostPeer === from;

    switch (raw.t) {
      case 'welcome':
        if (this.hostPeer !== null && !fromHost) return; // zweiter „Host" — ignorieren
        this.clearJoinTimer();
        this.hostPeer = from;
        this.mySeat = raw.seat;
        this.status = this.game.state ? 'playing' : 'lobby';
        this.netError = '';
        return;
      case 'reject':
        if (this.hostPeer !== null && !fromHost) return;
        this.clearJoinTimer();
        this.hostPeer = null;
        this.status = 'error';
        this.netError = raw.reason;
        return;
      case 'lobby':
        if (!fromHost) return;
        this.lobbySeats = raw.seats;
        if (this.status === 'connecting') this.status = 'lobby';
        return;
      case 'state':
        if (!fromHost) return;
        if (raw.version <= this.lastSeenVersion) return; // veraltet/unverändert — verwerfen
        this.lastSeenVersion = raw.version;
        this.game.setRemoteState(raw.state);
        this.status = 'playing';
        return;
      case 'error':
        if (!fromHost) return;
        this.netError = raw.message;
        return;
    }
  }
}

/** Sitzung der App (Ein-Gerät-Modus: bleibt schlicht unbenutzt). */
export const session = new Session(game, netBridge);
