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
| `pattern` | `(Ressource \| null)[][]` | Baumuster als Raster; Ressourcen: `wood`, `brick`, `stone`, `wheat`, `glass`. Rotation & Spiegelung erledigt die Engine. Max. 4×4 (das Landpartie-Brett ist 6×6, Muster bleiben klein). |
| `features` | string[] | Symbole der Mini-Karte, siehe unten |
| `feeding` | optional | Nur rote Karten: `{ "mode": "anywhere"\|"surrounding8"\|"rowAndColumn"\|"contiguousGroup"\|"rowOrColumnPerCoin"\|"adjacentPlusPerCoinPer2", "count"?: n }` |
| `unverified` | optional bool | Kartentext/-muster nicht aus Primärquellen belegt (⚠ auf der Mini-Karte) |
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
- `perAdjacentTerrain` — `{ "terrains": ["river"|"mountain"|"lake"…], "vpEach": n }` (Landpartie)
- `ifAdjacentTerrain` — `{ "terrains": […], "vp": n }` (Landpartie)
- `handler` — `{ "handler": "archive"\|"mandras"\|"skyBaths"\|"silva"\|"shrine"\|"starloom"\|"schoolhouse"\|"eraflage", "vp"?: n }`

**Selektoren (SEL):** `"cottage"` (Hütten-Gebäude; Schloss Barrett zählt doppelt),
`"fedCottage"`, `"self"` (gleiche Farbe wie die Karte), `{ "color": "…" }`, `{ "card": "id" }`.

## Effekte (`effects`)

*Basisspiel:* `factory`, `bank`, `tradingPost`, `warehouse`, `buildAnywhereSelf`,
`buildAnywhereAll`, `architectsGuild`, `groveUniversity`, `opaleye`, `bondmaker`,
`fortIronweed`, `cathedral`, `mausoleum`, `barrettCastle`

*Fortune:* `coinOnConstruct`, `coinOnConstruct2`, `statueCoins`, `gamblersDen`,
`teahouseCoins`, `jewelerToll`, `parsonageCheck`, `constructCost2`, `coinValue2`,
`masonsGuild`, `oddityShop`, `museum`, `cathedralTransform`, `grottoCoins`,
`promenadeCoins`, `prismForge`, `southernSemaphore`

Implementiert in `src/engine/game.ts` und `src/engine/scoring.ts`. Neue Mechaniken
brauchen einen neuen Effekt-Handler dort.

## Sets & Systeme

Sets werden in `src/data/sets.ts` registriert; Karten tragen das passende `set`-Feld
und mischen sich beim Setup in die Kategorie-/Monument-Pools (`randomSetup`).
Zwei Pseudo-Sets laufen daran vorbei: `internal` (Bahnhof, liegt im
Eisenbahn-Modus als 8. Karte aus) und `landpartie` (Anlieger-Karten, davon
werden im Landpartie-Modus 3 als Karten 8–10 gezogen; nie in Kategorie-Pools).
Systeme: `coins` (Fortune: 1 Münze bei 2+ Bauten pro Runde, max. 4, Tausch gegen
1 Münze außer als Baumeister, 1 SP je Münze am Ende) und `trees` (Tiny Trees:
Samen-Phase, Gratis-Material beim Überbauen, Baum = 2 SP als einziges unbebautes Feld).

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

## Fortune-Karten — verifiziert

Alle 12 Fortune-Gebäude und 10 Fortune-Monumente sind gegen Primärquellen
abgeglichen (Stand: alle `unverified`-Marker entfernt):

- Offizielles AEG-Rulebook-PDF (alderac.com, 2020 + 2025) — die Karten-Miniaturen
  neben den „Building/Monument Clarifications" enthalten die vollständigen
  Kartentexte und Baumuster und wurden Karte für Karte ausgelesen.
- UltraBoardGames Fortune-Klarstellungen (deckungsgleich mit dem Rulebook;
  dort heißt die Zehntscheune „Little Barn" — AEG-Druck: „Tithe Barn").
- BGG-Fotos für die zwei Karten ohne Klarstellung: „The Treasury at Okaver"
  (Solo-Challenge-Fotos) und „Shrine of the Windseed" (Partie-Foto, Okt. 2022).

Wichtige Regel-Details aus den Klarstellungen, die im Code stecken:

- **Kathedrale:** 3 Münzen zahlen ist FREIWILLIG; sonst entsteht das graue
  Gebäude der Partie auf dem Feld — mit dessen Bau-Effekt (Schuppen darf ziehen).
- **Museum:** beim Bau 2 Materialien auflegen; passende fremde Ansage darf
  statt platziert zurückgegeben werden (+1 Münze, 1×/Runde egal wie viele Museen).
- **Kuriositätenladen:** die Münze erhält der NEHMENDE Baumeister.
- **Juwelier:** Strafmünzen erst am Rundenende, auch an fertige Städte;
  Solo: ohne Münze nicht baubar.
- **Statue/Windschrein:** das gebaute Gebäude zählt sich selbst mit.
- **Promenade:** 3 Münzen Pflicht; die nächsten 3 fremden Ansagen MÜSSEN auf
  die Münzfelder, eigene Ansagen dürfen nicht (außer kein anderes Feld frei).
- **Grotte:** Münzen auf ALLE 4 Mittelfelder, bebaute sofort kassieren; Münze
  teilt sich das Feld mit Materialien; Reste verfallen am Spielende.
- **Semaphor:** nur bei fremder Ansage, Zusatz-Material freiwillig, Platzieren
  bringt 1 Münze; Münztausch des Erst-Materials verwirkt das Zusatz-Material.
- **Prisma-Schmiede:** 2 UNTERSCHIEDLICHE Gebäude, überlappende Materialien
  zählen doppelt, danach werden alle Reste entfernt; beide Bauten zählen für
  die Rundenmünze.
- **Hollow Hill:** −2 SP je Münztausch nach dem Bau.
- **Okaver:** „Truhe auf 4 gefüllt" → Gratis-Hütte (jedes Mal).
- **Eraflage:** wird wie eine Hütte GEFÜTTERT (9 SP nur gefüttert), zählt aber
  für keine Hütten-Wertung anderer Karten.
- **Münz-Slot:** Grotte, Estival, Promenade und Windschrein erweitern die
  Truhe auf 5 (`coinSlot`), sobald gebaut.
- **Special Note:** Auch per Karteneffekt platzierte Gebäude (Grove,
  Architektengilde, Opaleye, Steinmetzgilde, Okaver, Kathedralen-Umbau)
  bringen ihre Bau-Effekte.

Solo ausgeschlossen (Fortune): `oddity_shop`, `schoolhouse`, `southern_semaphore`.

**Solo = fremde Ansage:** Die offizielle Solo-Regel erlaubt den Münztausch
explizit für die Deck-Wahl — entsprechend behandelt die Engine die Deck-Wahl
überall als „fremde Ansage": Fabrik, Münztausch, **Museum-Rückgabe**,
**Promenaden-Pflichtfelder** (mit Münzgewinn) und **Bondmaker** funktionieren
im Solo normal. Der Juwelier ist solo nur mit 1 Münze baubar.
