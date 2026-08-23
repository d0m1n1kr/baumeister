// Produktiv-Transport: direkte Verbindungen zwischen den Geräten (WebRTC).
// Ein fremder Vermittlungsdienst wird nur für den Verbindungsaufbau gebraucht;
// danach laufen die Daten direkt — im selben WLAN also über das lokale Netz.
//
// Trystero wird dynamisch geladen, damit der Ein-Gerät-Modus die Bibliothek
// gar nicht erst herunterlädt.

import type { PeerId, Transport, TransportFactory, TransportHandlers } from './transport';

// Nur der Typ wird statisch importiert (zur Bauzeit entfernt); die Bibliothek
// selbst wird weiter unten dynamisch geladen.
import type { JsonValue } from 'trystero';

const APP_ID = 'tiny-towns-d0m1n1kr';

/** Safari liefert ohne Kamerafreigabe nur mDNS-Kandidaten; in WLANs mit
 *  Client-Isolation scheitert die Direktverbindung, daher STUN als Rückfall. */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' }
];

export const createTrysteroTransport: TransportFactory = async (
  roomCode: string,
  handlers: TransportHandlers
): Promise<Transport> => {
  const { joinRoom, selfId } = await import('trystero');

  const room = joinRoom(
    {
      appId: APP_ID,
      // Der Raum-Code verschlüsselt zusätzlich den Verbindungsaufbau.
      password: roomCode,
      rtcConfig: { iceServers: ICE_SERVERS }
    },
    `tt-${roomCode}`
  );

  // Unsere Nachrichten sind reines JSON; Trystero serialisiert und stückelt selbst.
  const action = room.makeAction<JsonValue>('game');
  action.onMessage = (data, context) => handlers.onMessage(data, context.peerId);
  room.onPeerJoin = (peerId) => handlers.onPeerJoin(peerId);
  room.onPeerLeave = (peerId) => handlers.onPeerLeave(peerId);

  return {
    selfId,
    send(msg: unknown, target?: PeerId) {
      void action.send(msg as JsonValue, target ? { target } : undefined);
    },
    close() {
      void room.leave();
    }
  };
};
