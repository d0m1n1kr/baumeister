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

/**
 * Handverlesene Vermittlungs-Relays statt der Trystero-Auslosung: Die aus der
 * appId gewürfelte Standard-Auswahl bestand ausschließlich aus kleinen Hobby-
 * und Forschungs-Relays (eines davon war beim Review gerade down) — Host und
 * Gast finden sich nur, wenn mindestens ein Relay für beide gleichzeitig
 * funktioniert. Diese acht sind große, etablierte Nostr-Relays; alle haben
 * beim Review einen echten REQ/EOSE-Handshake bestanden.
 * Achtung: Die Liste ist der Treffpunkt — eine Änderung trennt alte von neuen
 * App-Versionen, daher immer zusammen mit PROTOCOL_VERSION anfassen.
 */
const RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.mostr.pub',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
  'wss://nostr.oxtr.dev',
  'wss://purplerelay.com'
];

/** Safari liefert ohne Kamerafreigabe nur mDNS-Kandidaten; in WLANs mit
 *  Client-Isolation scheitert die Direktverbindung, daher STUN als Rückfall. */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' }
];

/** Zugriff auf die Relay-Sockets, sobald Trystero geladen ist (für die Anzeige). */
let getSockets: (() => Record<string, WebSocket>) | null = null;

/** Wie viele Vermittlungs-Relays gerade erreichbar sind — null, solange der
 *  P2P-Transport (noch) nicht benutzt wird. */
export function relayStatus(): { open: number; total: number } | null {
  if (!getSockets) return null;
  const sockets = Object.values(getSockets());
  return {
    open: sockets.filter((s) => s.readyState === WebSocket.OPEN).length,
    total: RELAY_URLS.length
  };
}

let visibilityHooked = false;

/**
 * iOS kappt im Hintergrund alle Sockets; Trysteros Wiederverbindung wartet
 * danach mit wachsendem Backoff (bis 60 s). Pausieren wir sie im Hintergrund,
 * werden die anstehenden Reconnects beim Zurückkehren SOFORT ausgeführt —
 * der Host ist damit direkt wieder auffindbar statt bis zu einer Minute später.
 */
function hookVisibility(pause: () => void, resume: () => void): void {
  if (visibilityHooked || typeof document === 'undefined') return;
  visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pause();
    else resume();
  });
}

export const createTrysteroTransport: TransportFactory = async (
  roomCode: string,
  handlers: TransportHandlers
): Promise<Transport> => {
  const { joinRoom, selfId, getRelaySockets, pauseRelayReconnection, resumeRelayReconnection } =
    await import('trystero');
  getSockets = getRelaySockets as () => Record<string, WebSocket>;
  hookVisibility(pauseRelayReconnection, resumeRelayReconnection);

  const room = joinRoom(
    {
      appId: APP_ID,
      // Der Raum-Code verschlüsselt zusätzlich den Verbindungsaufbau.
      password: roomCode,
      relayConfig: { urls: RELAY_URLS },
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
