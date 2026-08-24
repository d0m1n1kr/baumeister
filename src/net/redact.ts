// Geheimhaltung: Vor dem Senden an ein Gerät werden fremde Monumente unkenntlich
// gemacht. Statt die Felder zu leeren (und damit alle Typen optional machen zu
// müssen) wird die interne Kartenrückseite `hidden_monument` eingesetzt — die UI
// rendert sie wie jede andere Karte.

import type { GameState } from '../engine/types';

export const HIDDEN_MONUMENT = 'hidden_monument';

/**
 * Zustand aus Sicht eines Sitzplatzes. Am Spielende wird ungefiltert gesendet:
 * dann sind alle Monumente ohnehin aufgedeckt und die Gäste rechnen die Wertung
 * selbst nach.
 */
export function redactFor(state: GameState, seat: number): GameState {
  if (state.phase.t === 'gameOver') return state;

  const out: GameState = JSON.parse(JSON.stringify(state));

  out.players.forEach((p, i) => {
    if (i === seat) return;
    if (p.monument && !p.monument.built) p.monument = { card: HIDDEN_MONUMENT, built: false };
    if (p.monumentOptions) p.monumentOptions = p.monumentOptions.map(() => HIDDEN_MONUMENT);
  });

  // Die Auslosung in der Konfiguration verrät die Optionen ebenfalls.
  out.config.monumentDeals = out.config.monumentDeals.map((deal, i) =>
    i === seat ? deal : deal.map(() => HIDDEN_MONUMENT)
  );

  // Rathaus: Stapel-Reihenfolge und die 5 verdeckt abgeworfenen Karten sind
  // geheim — nur die Anzahlen bleiben sichtbar (für die Stapelanzeige).
  if (out.thDeck) out.thDeck = out.thDeck.map(() => 'wood');
  if (out.thDiscard) out.thDiscard = out.thDiscard.map(() => 'wood');
  if (out.config.townHallDeck) out.config.townHallDeck = out.config.townHallDeck.map(() => 'wood');
  delete out.config.thSeed;

  return out;
}
