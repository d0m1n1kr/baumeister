# Karten-Assets: JSON-Schema

Jede Karte ist eine JSON-Datei in `buildings/` (Gebäude) oder `monuments/` (Monumente),
plus optional ein schematisches SVG in `art/`. Neue Karten werden automatisch geladen
(`src/data/index.ts`) — **ohne Code-Änderung**, solange sie nur vorhandene Wertungs-
und Effekt-Bausteine verwenden.

## Felder

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | eindeutig, `[a-z0-9_]+` |
| `set` | string | Karten-Set, z. B. `"base"` |
| `kind` | `cottage` \| `building` \| `monument` | Kartenart |
| `category` | `cottage`, `food`, `well`, `chapel`, `theater`, `tavern`, `factory`, `monument` | Kategorie (pro Partie wird je Nicht-Monument-Kategorie 1 Karte gezogen) |
| `color` | `blue`, `red`, `grey`, `orange`, `yellow`, `green`, `black`, `pink` | Farbgruppe (für Wertungs-Selektoren) |
| `name`, `text` | `{ de: string, en?: string }` | Name und Regeltext (i18n) |
| `pattern` | `(Ressource \| null)[][]` | Baumuster als Raster; Ressourcen: `wood`, `brick`, `stone`, `wheat`, `glass`. Rotation & Spiegelung erledigt die Engine. Max. 4×4. |
| `features` | string[] | Symbole der Mini-Karte, siehe unten |
| `feeding` | optional | Nur rote Karten: `{ "mode": "anywhere"\|"surrounding8"\|"rowAndColumn"\|"contiguousGroup", "count"?: n }` |
| `scoring` | object | Deklarative Wertung, siehe unten |
| `effects` | string[] | Benannte Spiellogik-Effekte (Code in `engine/`), siehe unten |
| `art` | string | Dateiname des SVG in `art/` |

## Wertungs-Typen (`scoring.type`)

- `none` — keine Punkte
- `flat` — `{ "vp": n }`
- `ifFed` — `{ "vp": n }`: Punkte, wenn das Gebäude gefüttert ist
- `byCountTable` — `{ "table": [p1, p2, …], "overflow": n }`: Gesamtpunkte nach Anzahl gleicher Gebäude
- `perAdjacent` — `{ "target": SEL, "vpEach": n }`
- `ifAdjacentAny` — `{ "targets": [SEL…], "vp": n }`
- `ifNotAdjacentAny` — `{ "targets": [SEL…], "vp": n }`
- `ifAdjacentAtLeast` — `{ "target": SEL, "count": n, "vp": n }`
- `perInTown` — `{ "target": SEL, "vpEach": n }`
- `perInZone` — `{ "zone": "corners"\|"center4", "target": SEL, "vpEach": n, "base"?: n }`
- `perUniqueTypesInRowCol` — `{ "vpEach": n }`: andere Gebäudetypen in Zeile+Spalte
- `perSameCardInRowCol` — `{ "vpEach": n }`: gleiche Karte in Zeile ∪ Spalte, selbst 1× mitgezählt
- `ifAloneInRowAndCol` — `{ "target": SEL, "vp": n }`
- `perOwnCountVsRightNeighbor` — `{ "baseEach": n, "bonusEach": n }`
- `perStoredResource` — `{ "vpEach": n }` (z. B. Lagerhaus: −1)
- `handler` — `{ "handler": "archive"\|"mandras"\|"skyBaths"\|"silva"\|"shrine"\|"starloom", "vp"?: n }`

**Selektoren (SEL):** `"cottage"` (Hütten-Gebäude; Schloss Barrett zählt doppelt),
`"fedCottage"`, `"self"` (gleiche Farbe wie die Karte), `{ "color": "…" }`, `{ "card": "id" }`.

## Effekte (`effects`)

`factory`, `bank`, `tradingPost`, `warehouse`, `buildAnywhereSelf`, `buildAnywhereAll`,
`architectsGuild`, `groveUniversity`, `opaleye`, `bondmaker`, `fortIronweed`,
`cathedral`, `mausoleum`, `barrettCastle` — implementiert in `src/engine/game.ts` und
`src/engine/scoring.ts`. Neue Mechaniken brauchen einen neuen Effekt-Handler dort.

## Features (Symbolzeile der Mini-Karte)

`feedable`, `feeds`, `adjacency`, `no-adjacency`, `row-col`, `corners`, `center`,
`count-table`, `holds-resource`, `wild-resource`, `interactive`, `on-construct`,
`placement-override`, `negative-vp`, `vs-neighbor`, `town-snapshot`, `finish-order`,
`empty-ok`, `unique-types`

## Regel-Anmerkungen (Basisspiel)

Folgende Detailauslegungen sind im Code umgesetzt und getestet; sie folgen
Rulebook + gängigen Klarstellungen (UltraBoardGames/BGG):

- **Markt:** zählt Märkte in Zeile **und** Spalte, sich selbst einmal → max 7 Punkte.
- **Schloss Barrett:** wird als *ein* Gebäude gefüttert, zählt aber als 2 (gefütterte) Hütten.
- **Mausoleum:** ungefütterte Hütten (nur Kategorie `cottage`) zählen 3 Punkte; macht sie nicht „gefüttert“ für Kapelle/Tempel.
- **Sternenwebstuhl:** 1.→6, 2.→3, 3.→2, ab 4.→0; gleiche Runde = gleicher Rang.
- **Opaleyes Wacht:** Basispunkte 0.
