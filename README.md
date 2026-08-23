# Tiny Towns für das iPad

Digitale Umsetzung des Brettspiels *Tiny Towns* (Basisspiel) als rein clientseitige
Web-App (PWA) für **2–4 Spieler an einem iPad im Querformat**: Alle spielen gleichzeitig
an den vier Ecken des Geräts, die 7 Gebäudekarten der Partie liegen in der Mitte.

## Features

- **Vollautomatische Regeln:** Muster-Validierung (Rotation + Spiegelung), alle
  Gebäude-Effekte (Fabrik, Bank, Handelsposten, Lagerhaus, …), sämtliche
  Monument-Effekte und die komplette Endwertung inkl. optimaler Fütterungs-Zuordnung.
- **Komplettes Basisspiel:** 25 Gebäudekarten + 15 Monumente als erweiterbare
  JSON/SVG-Assets (`src/data/`, Schema in [`src/data/schema.md`](src/data/schema.md)).
- **Erweiterungen (im Setup wählbar):**
  - *Fortune* — komplette Münz-Mechanik (verdienen bei 2+ Bauten, Truhe mit 4 Slots,
    Münze zahlen für ein anderes Material, 1 SP je Münze) plus 12 Gebäude und
    10 Monumente. Einzelne nicht öffentlich belegbare Karten sind „best effort“
    umgesetzt und mit ⚠ markiert (Liste in `schema.md`).
  - *Tiny Trees* — Samen-Marker: Überbauen bringt ein Gratis-Material, als letztes
    unbebautes Feld wird der Samen ein Baum (2 Punkte).
- **Höhlen-Regel (im Setup wählbar, Standard aus):** bis zu 2 fremd angesagte
  Materialien pro Partie beiseitelegen — sie zählen am Ende weder Punkte noch Strafen.
- **Multi-Touch:** Mehrere Spieler können gleichzeitig Materialien per Drag & Drop
  auf ihre Bretter ziehen; jede Ecke ist zum jeweiligen Spieler rotiert.
- **Monument-Geheimhaltung:** 2 ziehen / 1 geheim wählen, Aufdecken nur nach
  Bestätigung („Alle anderen wegschauen!“).
- **Karten-Zoom:** Tippen vergrößert jede Karte, zum antippenden Spieler gedreht;
  Mini-Karten zeigen Baumuster, Feature-Symbole und schematisches Artwork.
  In der Einzelansicht (eigenes Gerät) blendet der **Alice-Modus** alle Karten
  dauerhaft samt Beschreibung ein — nichts muss mehr angetippt werden.
- **Zwei Spielweisen:**
  - *An einem Gerät* (Standard, unverändert): reihum am selben iPad, **komplett offline**.
  - *Mit eigenen Geräten*: Der Host öffnet einen Raum, Mitspieler treten per QR-Code
    oder 6-stelligem Code bei — **ohne Server**, direkt von Gerät zu Gerät (WebRTC).
    Sitzplätze lassen sich mischen: einige Spieler am Host-Gerät, andere mit eigenem
    Handy. Monumente sind dabei erstmals wirklich geheim.
- **Soundeffekte (abschaltbar):** warme Marimba-, Holz- und Glockenklänge —
  komplett per Web Audio synthetisiert (keine Asset-Dateien, keine Lizenzfragen,
  offline). Ansage, Platzieren (Tonhöhe je Material), Bauen, Monument-Glocke,
  Münze, Baum, Fehlerton, „du bist dran" und Schluss-Fanfare; 🔊-Schalter in
  der Kartenleiste, Wahl wird je Gerät gemerkt.
- **Persistenz:** Autosave im `localStorage` nach jeder Aktion, „Weiterspielen“ nach Reload.
- **PWA:** vollständig offline-fähig (alle Assets werden beim ersten Besuch
  precacht; Spiel-Logik und Spielstand liegen komplett im Client) — am iPad/Handy
  über „Zum Home-Bildschirm“ installierbar. Die App prüft beim Start, beim
  Zurückkehren in die App und alle 15 Minuten auf neue Versionen und bietet
  ein Update per Banner an; der laufende Spielstand übersteht das Update.

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server
npm test           # Engine-, Netzwerk- und Store-Tests (Vitest)
npx vitest run --coverage   # dito mit Coverage-Bericht
npm run check      # svelte-check
npm run build      # Produktions-Build (dist/)
node scripts/smoke.mjs        # E2E: Ein-Gerät-Modus (Chromium)
node scripts/smoke-multi.mjs  # E2E: Mehrgerätemodus in zwei Tabs
```

Der Mehrgeräte-Test läuft über `?transport=channel`: derselbe Sitzungs- und Host-Code,
aber über `BroadcastChannel` zwischen zwei Tabs statt über echtes P2P — dadurch ohne
Netz testbar. Dieser Schalter eignet sich auch zum Entwickeln am Rechner.

## Architektur

```
src/engine/   Pure-TS-Spiellogik (kein DOM): Reducer, Muster, Wertung, Effekte — Vitest-getestet
src/data/     Karten-Assets: JSON je Karte + SVG-Artwork, automatisch geladen
src/ui/       Svelte-5-Komponenten (Spieltisch, Ecken, Karten, Dialoge, Lobby)
src/store/    Engine↔UI-Bindung, localStorage-Persistenz, Drag-Zustand
src/net/      Mehrgerätemodus: Protokoll, austauschbarer Transport, Sitzplätze, Sitzung
```

### Mehrgerätemodus

Der Host führt die Spiel-Engine und ist die Regelinstanz; Gäste schicken nur Aktionen
und rendern den empfangenen Zustand (~3 KB, wird komplett übertragen — keine Deltas).
Die Umleitung sitzt an genau einer Stelle (`netBridge` in `src/store/gameStore.svelte.ts`):
Ohne aktive Sitzung läuft exakt der bisherige Ein-Gerät-Pfad.

Der Transport steckt hinter einem schmalen Interface (`src/net/transport.ts`) — es gibt
eine P2P-Variante (Trystero, wird nur bei Bedarf nachgeladen), eine BroadcastChannel-Variante
für Tests und eine In-Memory-Variante für Unit-Tests. Ein Wechsel des Vermittlungsdienstes
berührt die Spiellogik nicht. Die Vermittlung läuft über eine **handverlesene Liste von
8 großen Nostr-Relays** (`trysteroTransport.ts`) statt der Trystero-Auslosung — die Liste
ist der Treffpunkt aller Geräte, Änderungen daran immer zusammen mit `PROTOCOL_VERSION`.
Beim Verbinden zeigt die App an, wie viele Relays erreichbar sind (auch in Host-Lobby
und Raum-Code-Dialog). Nach längerem Hintergrund baut die App den Raum komplett neu
auf — Nostr-Relays vergessen ihre Abos beim Socket-Abriss, und Trystero 0.25 erneuert
sie nach einem Reconnect nicht (das Gerät würde sonst senden, aber nichts mehr hören).

**iOS-Eigenheit:** Wird die App in den Hintergrund geschickt oder das Display gesperrt,
beendet iOS jede Verbindung — dagegen hilft keine Technik. Die App hält deshalb während
der Partie den Bildschirm wach (Wake Lock) und gleicht bei jeder Rückkehr in den
Vordergrund den vollen Zustand ab; getrennte Plätze bleiben reserviert. Wird der Tab
komplett neu geladen (auch das macht iOS gern), tritt ein Gast automatisch wieder bei
(Sitzung liegt im `localStorage`; beim Verbinden ruft er alle 3 s erneut, Frist 30 s,
und selbst nach einem Fehlschlag bleibt die Sitzung für den nächsten Versuch gemerkt).
Der Host stellt mit „Weiterspielen" Partie **und** Raum wieder her — die Gäste
verbinden sich dann von selbst neu. Über den Raum-Code-Knopf im Spiel kann der Host
außerdem jederzeit Plätze **per QR an (neue) Geräte übergeben** — auch mitten in
der Partie, samt Spielstand.

**Neue Karten** brauchen nur eine JSON-Datei (+ optional SVG) in `src/data/buildings/`
bzw. `src/data/monuments/` — solange sie vorhandene Wertungs-/Effekt-Bausteine nutzen,
ist kein Code nötig. Details: [`src/data/schema.md`](src/data/schema.md).

## Deployment

Der Workflow `.github/workflows/deploy.yml` baut bei jedem Push auf `main` und
veröffentlicht auf **GitHub Pages**. Einmalig aktivieren:
Repo-Einstellungen → *Pages* → *Source: GitHub Actions*.

## Hinweis

Fan-Projekt für den privaten Gebrauch. *Tiny Towns* ist ein Spiel von Peter McPherson
(AEG). Alle Grafiken hier sind eigene, schematische Nachbildungen — es werden keine
Original-Assets verwendet.
