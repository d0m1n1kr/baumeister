// Nachrichtenformat zwischen Host und Gästen. Bewusst klein und JSON-serialisierbar:
// Der komplette Spielzustand sind nur ~3 KB, deshalb wird er ganz übertragen statt
// als Differenz.

import type { Action, GameState } from '../engine/types';

/** Bei Änderungen erhöhen — verhindert, dass Geräte mit unterschiedlichen App-Ständen
 *  in einer Partie landen und sich gegenseitig kaputte Zustände schicken. */
export const PROTOCOL_VERSION = 1;

export interface SeatInfo {
  index: number;
  name: string;
  corner: number;
  /** local = wird am Host-Gerät bedient, remote = eigenes Gerät. */
  kind: 'local' | 'remote';
  connected: boolean;
}

export type ClientMessage =
  | { t: 'hello'; clientId: string; name: string; protocolVersion: number }
  | { t: 'action'; action: Action }
  /** Trägt die Gerätekennung mit: Hat der Host die Verbindung als verloren
   *  verbucht, kann er den Platz allein daran wieder zuordnen. */
  | { t: 'resync'; clientId: string };

export type HostMessage =
  | { t: 'welcome'; seat: number; protocolVersion: number }
  | { t: 'reject'; reason: string }
  | { t: 'lobby'; seats: SeatInfo[] }
  | { t: 'state'; state: GameState; version: number }
  | { t: 'error'; message: string };

export function isClientMessage(msg: unknown): msg is ClientMessage {
  if (!msg || typeof msg !== 'object') return false;
  const t = (msg as { t?: unknown }).t;
  return t === 'hello' || t === 'action' || t === 'resync';
}

export function isHostMessage(msg: unknown): msg is HostMessage {
  if (!msg || typeof msg !== 'object') return false;
  const t = (msg as { t?: unknown }).t;
  return t === 'welcome' || t === 'reject' || t === 'lobby' || t === 'state' || t === 'error';
}

/** Raum-Code: 6 Zeichen ohne verwechselbare Ziffern/Buchstaben (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeRoomCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function isValidRoomCode(code: string): boolean {
  return code.length === 6 && [...code].every((c) => CODE_ALPHABET.includes(c));
}
