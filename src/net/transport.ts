// Transport-Abstraktion: Die Spiellogik kennt nur dieses Interface, nie eine
// konkrete Verbindungsbibliothek. Dadurch ist die Abhängigkeit von fremden
// Vermittlungsdiensten austauschbar (P2P heute, notfalls etwas anderes morgen)
// und in Tests durch eine In-Memory-Variante ersetzbar.

export type PeerId = string;

export interface TransportHandlers {
  onMessage(msg: unknown, from: PeerId): void;
  onPeerJoin(peer: PeerId): void;
  onPeerLeave(peer: PeerId): void;
}

export interface Transport {
  readonly selfId: PeerId;
  /** Ohne target an alle verbundenen Peers. */
  send(msg: unknown, target?: PeerId): void;
  close(): void;
}

export type TransportFactory = (
  roomCode: string,
  handlers: TransportHandlers
) => Promise<Transport>;

/** Zufällige, für eine Verbindung stabile Peer-Kennung. */
export function randomPeerId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
