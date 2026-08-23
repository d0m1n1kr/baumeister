// In-Memory-Transport für Tests: Host und Gäste laufen im selben Prozess.
// Nachrichten werden synchron in einer Mikrotask zugestellt, damit Tests
// deterministisch bleiben (kein Timer, keine echte Nebenläufigkeit).

import type { PeerId, Transport, TransportHandlers } from './transport';

interface Member {
  id: PeerId;
  handlers: TransportHandlers;
}

export class LoopbackNetwork {
  private members: Member[] = [];
  /** Absichtlich getrennte Peers: senden/empfangen nichts mehr. */
  private offline = new Set<PeerId>();

  connect(id: PeerId, handlers: TransportHandlers): Transport {
    const member: Member = { id, handlers };
    // Bestehende Teilnehmer über den Neuzugang informieren (und umgekehrt)
    for (const other of this.members) {
      other.handlers.onPeerJoin(id);
      handlers.onPeerJoin(other.id);
    }
    this.members.push(member);

    return {
      selfId: id,
      send: (msg: unknown, target?: PeerId) => {
        if (this.offline.has(id)) return;
        // Klonen, damit Empfänger keine Referenzen auf Sender-Objekte halten
        const payload = JSON.parse(JSON.stringify(msg));
        for (const other of this.members) {
          if (other.id === id) continue;
          if (target && other.id !== target) continue;
          if (this.offline.has(other.id)) continue;
          other.handlers.onMessage(payload, id);
        }
      },
      close: () => this.disconnect(id)
    };
  }

  /** Verbindung trennen (wie App im Hintergrund / Display gesperrt). */
  goOffline(id: PeerId): void {
    if (this.offline.has(id)) return;
    this.offline.add(id);
    for (const other of this.members) {
      if (other.id !== id) other.handlers.onPeerLeave(id);
    }
  }

  /** Rückkehr aus dem Hintergrund. */
  goOnline(id: PeerId): void {
    if (!this.offline.delete(id)) return;
    for (const other of this.members) {
      if (other.id !== id) other.handlers.onPeerJoin(id);
    }
  }

  disconnect(id: PeerId): void {
    const i = this.members.findIndex((m) => m.id === id);
    if (i < 0) return;
    this.members.splice(i, 1);
    this.offline.delete(id);
    for (const other of this.members) other.handlers.onPeerLeave(id);
  }
}
