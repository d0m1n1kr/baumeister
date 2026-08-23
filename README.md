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
- **Multi-Touch:** Mehrere Spieler können gleichzeitig Materialien per Drag & Drop
  auf ihre Bretter ziehen; jede Ecke ist zum jeweiligen Spieler rotiert.
- **Monument-Geheimhaltung:** 2 ziehen / 1 geheim wählen, Aufdecken nur nach
  Bestätigung („Alle anderen wegschauen!“).
- **Karten-Zoom:** Tippen vergrößert jede Karte, zum antippenden Spieler gedreht;
  Mini-Karten zeigen Baumuster, Feature-Symbole und schematisches Artwork.
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
npm test           # Engine-Tests (Vitest)
npm run check      # svelte-check
npm run build      # Produktions-Build (dist/)
node scripts/smoke.mjs  # E2E-Smoke-Test (Chromium)
```

## Architektur

```
src/engine/   Pure-TS-Spiellogik (kein DOM): Reducer, Muster, Wertung, Effekte — Vitest-getestet
src/data/     Karten-Assets: JSON je Karte + SVG-Artwork, automatisch geladen
src/ui/       Svelte-5-Komponenten (Spieltisch, Ecken, Karten, Dialoge)
src/store/    Engine↔UI-Bindung, localStorage-Persistenz, Drag-Zustand
```

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
