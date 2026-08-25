# Tiny Towns for Tablets & Phones

Digital adaptation of the board game *Tiny Towns* (base game) as a purely client-side
web app (PWA) for **tablets and phones**. The classic mode puts **2–4 players around
one tablet in landscape**: everyone plays simultaneously at the four corners of the
device, with the game's 7 building cards in the middle — or each player joins with
their own device.

**▶ Play: [d0m1n1kr.github.io/tiny-towns](https://d0m1n1kr.github.io/tiny-towns/)**

## In the game

**One tablet, four towns.** Everyone plays at the same time; each corner is
rotated toward its player, and the round's building cards sit in the middle.
The Master Builder (👑) has named wheat — everyone places it on their own board.

![Four players around one tablet](docs/screenshots/tablet-table.png)

**Everyone on their own device — no server.** The host opens a room; the others
join by scanning the QR code with the normal camera app (or typing the
6-character code). Seats can be mixed: some players on the host tablet, others
on their own phone.

| Host opens a room | Guest on their phone |
| --- | --- |
| <img src="docs/screenshots/lan-lobby.png" alt="Host lobby with QR code and seat list" width="420"> | <img src="docs/screenshots/lan-guest-phone.png" alt="Guest view on a phone: own board large, opponents as mini boards" width="200"> |

On a phone you get your own board big, with the opponents shown as compact
mini boards above — and your monument stays genuinely secret, because nobody
else's device ever receives it.

**The host still sees the whole table.** Here seat 1 is played on the host
tablet while Anna and Ben are on their phones — the state is identical on every
device (the host runs the engine and broadcasts it).

![Host table with two remote players](docs/screenshots/lan-host-table.png)

## Features

- **Fully automated rules:** pattern validation (rotation + mirroring), all building
  effects (Factory, Bank, Trading Post, Warehouse, …), every monument effect, and the
  complete final scoring including optimal feeding assignment.
- **Complete base game:** 25 building cards + 15 monuments as extensible
  JSON/SVG assets (`src/data/`, schema in [`src/data/schema.md`](src/data/schema.md)).
- **Expansions (selectable in setup):**
  - *Fortune* — the full coin mechanic (earn on 2+ builds, chest with 4 slots,
    pay a coin for a different resource, 1 VP per coin) plus 12 buildings and
    10 monuments. All 22 cards verified against the official card texts
    (sources in `schema.md`).
  - *Tiny Trees* — seed tokens: building over a seed grants a free resource; as the
    last empty square, the seed becomes a tree (2 points).
- **Themes (per device):** the classic forest town, a **Mars colony**, or a
  **dragon realm** — same rules, different world. Every card (base game,
  monuments, Fortune, station) gets its own name, rule text, and artwork, and the
  vocabulary changes with it: on Mars you supply habitats in a colony with
  regolith and ice, coins become power cells; in the dragon realm you provision
  crofts in a hamlet with elfwood, dragonscale, runestone, moongrain, and
  faeglass, coins become **mana**, and Tiny Trees seeds become faeseeds growing
  into a World Tree. The railway changes shape too: a **transit capsule** gliding
  through a tube with airlocks, or a **dragon** flying along the board edges with
  three slings, vanishing into cloud banks and roaring as it lands on an eyrie.
  Since the game state is theme-agnostic, players in one multi-device game can
  each use their own theme. Switch via the 🎨 picker.
- **8 languages:** German, English, French, Spanish, Italian, Dutch, Portuguese,
  Polish — auto-selected from the browser language, overridable via the 🌐 switcher
  (setup and join screens). All rule error messages are translated too; card texts
  fall back to the English originals outside German.
- **Cavern rule (selectable in setup, off by default):** set aside up to 2 resources
  named by others per game — at the end they count neither points nor penalties.
- **Town Hall mode (official variant, selectable in setup):** no Master Builder —
  a resource deck (15 cards, 5 discarded face-down) drives two rounds; every 3rd
  round everyone chooses freely. Factory/Warehouse/coin swap apply to drawn cards,
  the Bank blocks your free choice, Fort Ironweed sits out free rounds.
- **Railway mode (our own digital-native variant, selectable in setup):** tracks
  run permanently along the top and bottom edges of the play area, with tunnel
  portals at the ends. A train with 3 wagons (behind the locomotive) is always
  visible with its load; at the end of every round it drives to the next town —
  with steam sounds while moving and a horn when it pulls into a station. With a
  built **train station** (an 8th card laid out for everyone, max. 1 per town,
  must sit on the track — the bottom row of your town) you may load the received
  resource into an empty wagon instead of placing it — or swap it for a wagon's
  contents. The train stops at every town either way; without a station you just
  can't load or unload. The wagons are public: what you drop off, an opponent may
  grab along the way.
- **Multi-touch:** several players can drag & drop resources onto their boards at
  the same time; each corner is rotated toward its player.
- **Monument secrecy:** draw 2 / secretly pick 1, revealing only after confirmation
  ("Everyone else look away!").
- **Card zoom:** tapping enlarges any card, rotated toward the tapping player;
  mini cards show build patterns, feature icons, and schematic artwork.
  In the single-board view (own device), **Alice mode** keeps all cards with their
  descriptions permanently visible — no more tapping required.
- **Solo mode (official variant):** 15 resource cards as a deck, 3 face up, one is
  chosen and rotates face-down to the bottom. With the official rank table
  (up to "Master Architect"), a per-device highscore list, and a **daily challenge**
  (fixed date seed — the same cards worldwide, scores comparable).
- **Learning mode (🎓, solo):** a guided game for newcomers. Instruction bubbles
  walk through every phase — monument draft, deck pick, placing, marking a
  pattern, choosing the spot, ending the round, finishing the town — and each one
  also says what changes **with several players** (a Master Builder instead of
  the deck, simultaneous play, swap cards only on another player's naming). The
  suggested square is highlighted with its reason ("2 of 3 for the Farm"); the
  advice comes from a pure analyser (`src/engine/advice.ts`) that reuses the
  pattern matcher, so it never proposes an illegal move — and stays silent when
  it has nothing useful to say. Bubbles are dismissed one at a time and
  remembered per device; the final screen sums up the multiplayer differences.
- **Two ways to play:**
  - *On one device* (default, unchanged): taking turns around the same tablet,
    **fully offline**.
  - *With everyone's own devices*: the host opens a room, players join via QR code
    (camera app or the built-in scanner — important for the installed PWA) or a
    6-character code — **no server**, directly device to device (WebRTC).
    Seats can be mixed: some players on the host device, others on their own phone.
    Monuments are truly secret for the first time.
- **Sound effects (can be muted):** warm marimba, wood, and bell tones —
  fully synthesized via Web Audio (no asset files, no licensing questions,
  offline). Resource call, placement (pitch per resource), building, monument bell,
  coin, tree, error tone, "your turn", and the final fanfare; 🔊 toggle in the card
  strip, the choice is remembered per device.
- **Persistence:** autosave to `localStorage` after every action, "Continue" after reload.
- **PWA:** fully offline-capable (all assets are precached on first visit; game
  logic and game state live entirely in the client) — installable on tablets and
  phones via "Add to Home Screen". The app checks for new versions on start, on
  returning to the app, and every 15 minutes, offering an update via banner; the
  running game survives the update.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # engine, network, and store tests (Vitest)
npx vitest run --coverage   # same with coverage report
npm run check      # svelte-check
npm run build      # production build (dist/)
node scripts/smoke.mjs        # E2E: single-device mode (Chromium)
node scripts/smoke-multi.mjs  # E2E: multi-device mode in two tabs
node scripts/smoke-learn.mjs  # E2E: learning mode (bubbles, phone + tablet)
```

The multi-device test runs with `?transport=channel`: the same session and host code,
but over `BroadcastChannel` between two tabs instead of real P2P — testable without
any network. This switch is also handy for developing on a desktop.

## Architecture

```
src/engine/   Pure-TS game logic (no DOM): reducer, patterns, scoring, effects,
              move advice for the learning mode — Vitest-tested
src/data/     Card assets: JSON per card + SVG artwork, loaded automatically
src/i18n/     Translations (8 languages), language detection, error-message mapping
src/theme/    Themes (Mars, dragon realm): card/resource/UI overrides per device
src/ui/       Svelte 5 components (game table, corners, cards, dialogs, lobby)
src/store/    Engine↔UI binding, localStorage persistence, drag state
src/net/      Multi-device mode: protocol, swappable transport, seats, session
```

### Multi-device mode

The host runs the game engine and is the rules authority; guests only send actions
and render the received state (~3 KB, transferred in full — no deltas).
The redirection sits in exactly one place (`netBridge` in `src/store/gameStore.svelte.ts`):
without an active session, exactly the previous single-device path runs.

The transport sits behind a narrow interface (`src/net/transport.ts`) — there is a
P2P variant (Trystero, lazy-loaded only when needed), a BroadcastChannel variant for
tests, and an in-memory variant for unit tests. Swapping the signaling service does
not touch the game logic. Signaling runs over a **hand-picked list of 8 large Nostr
relays** (`trysteroTransport.ts`) instead of Trystero's random draw — the list is the
meeting point of all devices; change it only together with `PROTOCOL_VERSION`.
While connecting, the app shows how many relays are reachable (also in the host lobby
and the room-code dialog). After a longer stay in the background, the app rebuilds the
room from scratch — Nostr relays forget their subscriptions when the socket drops, and
Trystero 0.25 does not renew them after a reconnect (the device would still send but
no longer hear anything).

**iOS quirk:** when the app goes to the background or the display locks, iOS kills
every connection — no technique prevents that. The app therefore keeps the screen
awake during the game (Wake Lock) and re-syncs the full state on every return to the
foreground; disconnected seats stay reserved. If the tab is fully reloaded (iOS likes
doing that too), a guest rejoins automatically (the session lives in `localStorage`;
while connecting it re-calls every 3 s with a 30 s deadline, and even after a failure
the session is kept for the next attempt). The host restores both the game **and** the
room via "Continue" — guests then reconnect on their own. Via the room-code button in
the game, the host can also **hand seats to (new) devices via QR** at any time — even
mid-game, including the game state.

**New cards** only need a JSON file (+ optional SVG) in `src/data/buildings/` or
`src/data/monuments/` — as long as they use existing scoring/effect building blocks,
no code is required. Details: [`src/data/schema.md`](src/data/schema.md).

## Deployment

The workflow `.github/workflows/deploy.yml` builds on every push to `main` and
publishes to **GitHub Pages**. One-time setup:
repo settings → *Pages* → *Source: GitHub Actions*.

## Note

Fan project for private use. *Tiny Towns* is a game by Peter McPherson
(AEG). All graphics here are original, schematic recreations — no original
assets are used.
