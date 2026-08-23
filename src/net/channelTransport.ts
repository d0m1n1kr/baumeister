// Transport über BroadcastChannel: verbindet mehrere Tabs bzw. Fenster desselben
// Geräts — ohne Netz, ohne Vermittlungsdienst. Gedacht für Entwicklung und für
// End-to-End-Tests (zwei Tabs), nicht für echtes Spielen über mehrere Geräte.

import { randomPeerId, type PeerId, type Transport, type TransportHandlers } from './transport';

type Envelope =
  | { kind: 'join'; from: PeerId }
  | { kind: 'here'; from: PeerId; to: PeerId }
  | { kind: 'leave'; from: PeerId }
  | { kind: 'msg'; from: PeerId; to?: PeerId; payload: unknown };

export async function createChannelTransport(
  roomCode: string,
  handlers: TransportHandlers
): Promise<Transport> {
  const selfId = randomPeerId();
  const channel = new BroadcastChannel(`tinytowns-room-${roomCode}`);
  const peers = new Set<PeerId>();

  const addPeer = (id: PeerId) => {
    if (id === selfId || peers.has(id)) return;
    peers.add(id);
    handlers.onPeerJoin(id);
  };

  channel.onmessage = (event: MessageEvent<Envelope>) => {
    const env = event.data;
    if (!env || env.from === selfId) return;
    switch (env.kind) {
      case 'join':
        addPeer(env.from);
        // dem Neuzugang die eigene Anwesenheit melden
        channel.postMessage({ kind: 'here', from: selfId, to: env.from } satisfies Envelope);
        break;
      case 'here':
        if (env.to === selfId) addPeer(env.from);
        break;
      case 'leave':
        if (peers.delete(env.from)) handlers.onPeerLeave(env.from);
        break;
      case 'msg':
        if (env.to && env.to !== selfId) return;
        addPeer(env.from);
        handlers.onMessage(env.payload, env.from);
        break;
    }
  };

  const announceLeave = () => channel.postMessage({ kind: 'leave', from: selfId } satisfies Envelope);
  globalThis.addEventListener?.('pagehide', announceLeave);

  channel.postMessage({ kind: 'join', from: selfId } satisfies Envelope);

  return {
    selfId,
    send(msg: unknown, target?: PeerId) {
      channel.postMessage({ kind: 'msg', from: selfId, to: target, payload: msg } satisfies Envelope);
    },
    close() {
      announceLeave();
      globalThis.removeEventListener?.('pagehide', announceLeave);
      channel.close();
    }
  };
}
