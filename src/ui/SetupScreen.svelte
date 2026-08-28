<script lang="ts">
  import { game } from '../store/gameStore.svelte';
  import {
    DAILY_HISTORY,
    buildGameConfig,
    dayPlayable,
    shiftDay,
    todayId
  } from '../store/newGameConfig';
  import { loadNames, saveNames } from '../store/playerNames';
  import { loadPrefs, savePrefs } from '../store/setupPrefs';
  import { SETS } from '../data/sets';
  import { sortPlayersClockwise } from '../engine/registry';
  import { session } from '../net/session.svelte';
  import { selectedTransport } from '../net';
  import { makeRoomCode } from '../net/protocol';
  import type { Seat } from '../net/seats';
  import { t } from '../i18n';
  import CreditsFooter from './CreditsFooter.svelte';
  import LanguagePicker from './LanguagePicker.svelte';
  import ThemePicker from './ThemePicker.svelte';
  import BuyOriginal from './BuyOriginal.svelte';
  import HelpDialog from './HelpDialog.svelte';
  import { learn } from './learn.svelte';
  import { install } from './install.svelte';

  import type { DailyLink } from './share';

  let { onjoin, initialDaily = null }: { onjoin: () => void; initialDaily?: DailyLink | null } =
    $props();

  const DEFAULT_CORNERS: Record<number, number[]> = {
    1: [0],
    2: [0, 2],
    3: [0, 1, 3],
    4: [0, 1, 2, 3]
  };

  // Gemerkte Einstellungen dieses Geräts (Spielerzahl, Variante, Erweiterungen).
  // Kommt man über einen Challenge-Link, gelten sie NICHT: Der Link sagt, was
  // gespielt wird, und soll die eigenen Vorgaben auch nicht überschreiben.
  // Bewusst der Anfangswert: Geladen wird genau einmal beim Aufbau. Ein Link,
  // der später per hashchange kommt, überschreibt die Felder ohnehin selbst
  // (Effekt unten) — und `linkAktiv` verhindert dann das Zurückschreiben.
  // svelte-ignore state_referenced_locally
  const prefs = initialDaily === null ? loadPrefs() : null;

  let count = $state(prefs?.count ?? 4);
  // Leer heißt „Standardname". Vorher stand der Standardname als Wert im Feld
  // und musste erst weggelöscht werden, bevor man den eigenen tippen konnte.
  let names = $state(loadNames());
  let corners = $state([...DEFAULT_CORNERS[prefs?.count ?? 4]]);
  let useMonuments = $state(prefs?.useMonuments ?? true);
  let cavernRule = $state(prefs?.cavern ?? false);
  let townHall = $state(prefs?.townHall ?? false);
  let train = $state(prefs?.train ?? false);
  let chosenSets = $state<string[]>([...(prefs?.sets ?? [])]);
  let multiDevice = $state(prefs?.multiDevice ?? false);
  // Solo: freies Spiel, Tages-Challenge oder Lernspiel (mit Erklärblasen).
  // Der Lernmodus ist zusätzlich eine eigene Anzeige-Präferenz (Blasen im
  // Spiel); ist er an, war die letzte Partie ein Lernspiel — dann bleibt es
  // dabei, sonst gilt die gemerkte Variante.
  let soloMode = $state<'free' | 'daily' | 'learn'>(
    prefs?.soloMode ?? (learn.enabled ? 'learn' : 'free')
  );
  // Landpartie: 5×6 mit Landschaft und Anlieger-Karten — gilt für freies Solo
  // und Tages-Challenge, nicht fürs Lernspiel (das erklärt die 4×4-Klassik).
  let landMode = $state(prefs?.land ?? false);
  // Aus einem geteilten Link kann auch ein vergangener Tag kommen — dann wird
  // GENAU dieser gespielt, sonst ließe sich das Ergebnis nicht vergleichen.
  // Blättern muss trotzdem gehen: In der installierten App gibt es keinen Link
  // zum Antippen (iOS übergibt Web-Links nie an eine Homescreen-App), also ist
  // die Tageswahl der einzige Weg zu einer geteilten Challenge von gestern.
  // Startwert ist heute; ein Tag aus dem Link setzt der Effekt unten — dort
  // liegt auch der Fall „Link im schon offenen Tab" (nur hashchange).
  let dailyDate = $state(todayId());
  const canPrevDay = $derived(dayPlayable(shiftDay(dailyDate, -1)));
  const canNextDay = $derived(dayPlayable(shiftDay(dailyDate, 1)));
  function stepDay(delta: number) {
    const next = shiftDay(dailyDate, delta);
    if (dayPlayable(next)) dailyDate = next;
  }
  /** Ist gerade ein Challenge-Link im Spiel? Dann nichts merken. */
  const linkAktiv = $derived(initialDaily !== null);
  const daily = $derived(soloMode === 'daily');
  const solo = $derived(count === 1);
  // Handy? Erkannt an der KURZEN Seite, damit das Drehen des Geräts nichts
  // ändert: Ein Telefon bleibt hoch- wie querkant ein Telefon, ein Tablet
  // liegt in beiden Lagen über der Schwelle.
  let phone = $state(false);
  $effect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(max-width: 599px), (max-height: 599px)');
    const update = () => (phone = mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  // Zu drei oder vier an EINEM Handy wird das 5×6-Brett unbedienbar: Jeder
  // Quadrant ist dann nur halb so breit wie der Schirm, gemessen 23 px je Feld.
  // Mit eigenen Geräten sieht jeder sein Brett groß — dort gilt die Grenze nicht.
  const landTooTight = $derived(phone && !multiDevice && count >= 3);
  // Landpartie gilt sonst für jede Spielerzahl — nur das Lernspiel bleibt bei
  // der 4×4-Klassik, weil seine Erklärtexte darauf gebaut sind.
  const landAllowed = $derived((!solo || soloMode !== 'learn') && !landTooTight);
  const landActive = $derived(landMode && landAllowed);
  // Die Tages-Challenge spielt pur (Basisspiel mit Monumenten) — nur so ist ein
  // Datum weltweit dieselbe Partie. Erzwungen wird das in buildGameConfig; hier
  // verschwinden bloß die Häkchen, die dort ohnehin nichts mehr bewirken.
  const dailyPur = $derived(solo && daily);
  // Die Ecken-Wahl gibt es erst ab drei Spielern (siehe Markup).
  const eckenWahl = $derived(!solo && count > 2);
  // Die Spielerzeilen teilen sich ein Raster. Es muss genau so viele Spalten
  // haben, wie eine Zeile Elemente rendert — sonst rutschen die Felder der
  // nächsten Zeile in die freien Spalten der vorigen.
  const rowColumns = $derived(
    ['minmax(0, 1fr)', eckenWahl ? 'auto' : '', multiDevice ? 'auto' : ''].filter(Boolean).join(' ')
  );
  let remote = $state([false, true, true, true]);
  let error = $state('');
  let busy = $state(false);
  let showHelp = $state(false);

  // Geteilter Tages-Challenge-Link: Solo mit genau diesem Tag vorwählen. Als
  // Effekt und nicht als Anfangswert, weil iOS den Link gern im BEREITS
  // offenen Tab öffnet — dann gibt es nur ein hashchange, kein Neuladen.
  $effect(() => {
    if (!initialDaily) return;
    setCount(1);
    soloMode = 'daily';
    multiDevice = false;
    dailyDate = initialDaily.id;
    landMode = initialDaily.land;
  });

  function toggleSet(id: string) {
    chosenSets = chosenSets.includes(id)
      ? chosenSets.filter((s) => s !== id)
      : [...chosenSets, id];
  }

  /** Lernspiel: schlanke Vorauswahl (Basisspiel + Monumente), änderbar. */
  function setSoloMode(mode: 'free' | 'daily' | 'learn') {
    soloMode = mode;
    if (mode === 'learn') {
      chosenSets = [];
      useMonuments = true;
      train = false;
    }
  }

  /** Hinweis-Knopf: direkt ins Lernspiel, ohne weitere Einstellungen. */
  function startLearning() {
    learn.dismissHint();
    multiDevice = false;
    setCount(1);
    setSoloMode('learn');
    start();
  }

  function setCount(n: number) {
    count = n;
    corners = [...DEFAULT_CORNERS[n]];
  }

  function setCorner(i: number, corner: number) {
    const other = corners.findIndex((c, j) => c === corner && j !== i);
    if (other >= 0) corners[other] = corners[i]; // Ecken tauschen
    corners[i] = corner;
  }

  function currentPlayers() {
    return Array.from({ length: count }, (_, i) => ({
      name: names[i].trim() || t.defaultPlayer(i + 1),
      corner: corners[i],
      remote: multiDevice && remote[i]
    }));
  }

  function activeSets(): string[] {
    return ['base', ...chosenSets];
  }

  /**
   * Auswahl fürs nächste Mal merken — beim Start, denn dann ist sie echt.
   * Nicht bei einer Partie aus einem Challenge-Link: Der Link bestimmt Solo
   * und Tages-Challenge, das ist die Wahl des Absenders, nicht meine.
   */
  function merkeAuswahl() {
    if (linkAktiv) return;
    savePrefs({
      count,
      multiDevice,
      soloMode,
      land: landMode,
      useMonuments,
      sets: chosenSets,
      townHall,
      train,
      cavern: cavernRule
    });
  }

  function start() {
    try {
      saveNames(names);
      merkeAuswahl();
      // Der Lernmodus ist eine Anzeige-Präferenz dieses Geräts, kein Spielstand
      learn.set(solo && soloMode === 'learn');
      // Die Landpartie ist nur ein anderes Brett: Erweiterungen, Rathaus,
      // Eisenbahn und Höhle gelten dort genauso wie im klassischen Spiel.
      game.start(
        buildGameConfig(
          currentPlayers(),
          activeSets(),
          useMonuments,
          !solo && cavernRule,
          {
            solo,
            dailyId: solo && daily ? dailyDate : undefined,
            // Rathaus, Eisenbahn und Höhle sind Mehrspieler-Regeln: Ihre
            // Schalter stehen im Solo nicht da, also darf auch eine gemerkte
            // Auswahl aus einer früheren Runde nicht durchschlagen.
            townHall: !solo && townHall,
            train: !solo && train,
            land: landActive
          }
        )
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Mehrgerätemodus: Raum öffnen und auf Mitspieler warten. Die Sitzplätze werden
   * schon hier in Uhrzeiger-Reihenfolge angelegt, damit ihre Indizes später exakt
   * den Spielerindizes der Partie entsprechen.
   */
  async function openRoom() {
    if (busy) return;
    const seated = sortPlayersClockwise(currentPlayers());
    if (!seated.some((p) => !p.remote)) {
      error = t.needLocalSeat;
      return;
    }
    const seats: Seat[] = seated.map((p, index) => ({
      index,
      name: p.remote ? '—' : p.name,
      corner: p.corner,
      kind: p.remote ? 'remote' : 'local',
      connected: !p.remote
    }));
    busy = true;
    error = '';
    try {
      saveNames(names);
      merkeAuswahl();
      session.setup = {
        sets: activeSets(), useMonuments, cavern: cavernRule, townHall, train, land: landActive
      };
      await session.openRoom(makeRoomCode(), seats, selectedTransport());
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<main>
  <!-- Kopfzeile bleibt oben stehen, damit sie auf hohen Geräten nicht
       mitten im Bild schwebt. -->
  <div class="langRow"><ThemePicker /><LanguagePicker /></div>

  <div class="scroll">
    <h1>🏘 {t.appTitle}</h1>

    {#if learn.showHint}
      <!-- Einstiegshilfe: einmal weggeklickt, kommt sie nicht wieder -->
      <aside class="learnHint">
        <button class="hintClose tapArea" title={t.close} onpointerup={() => learn.dismissHint()}>✕</button>
        <span class="hintTitle">🎓 {t.learn.hintTitle}</span>
        <p class="hintText">{t.learn.hintText}</p>
        <button class="primary hintStart" onpointerup={startLearning}>{t.learn.hintStart}</button>
      </aside>
    {/if}

    {#if install.show}
      <!-- Installieren: auf Chromium der Systemdialog, auf iOS eine Anleitung
           (Apple bietet dafür keine Schnittstelle). Einmal weggeklickt bleibt
           der Hinweis weg. -->
      <aside class="installHint">
        <button class="hintClose tapArea" title={t.close} onpointerup={() => install.dismiss()}>✕</button>
        <span class="installText">
          <span class="installTitle">📲 {t.install.title}</span>
          <span class="installSub">{t.install.text}</span>
        </span>
        <button class="installGo" onpointerup={() => install.run()}>
          {install.kind === 'ios' ? t.install.how : t.install.action}
        </button>
        {#if install.steps}
          <ol class="installSteps">
            <li>
              {t.install.iosStep1}
              <!-- Apples Teilen-Zeichen selbst gezeichnet: das Systemglyph aus
                   der privaten Unicode-Fläche wird außerhalb von iOS zum
                   Ersatzkästchen. -->
              <svg class="shareIcon" viewBox="0 0 16 20" aria-hidden="true">
                <path d="M8 1.5 L4.8 4.7 M8 1.5 L11.2 4.7 M8 1.5 V12" />
                <path d="M3.5 8H2v10h12V8h-1.5" />
              </svg>
            </li>
            <li>{t.install.iosStep2}</li>
          </ol>
        {/if}
      </aside>
    {/if}

    <!-- Zwei Karten: „Wer spielt" links, „Wie wird gespielt" rechts. Auf
         breiten Geräten nebeneinander, sonst untereinander. -->
    <div class="cards">
      <section class="card">
        <h2>{t.setupGame}</h2>

        <div class="row">
          <span class="label">{t.players}</span>
          <div class="seg">
            {#each [1, 2, 3, 4] as n}
              <button class:primary={count === n} onpointerup={() => setCount(n)}>{n}</button>
            {/each}
          </div>
        </div>

        <div class="stack">
          <span class="label">{solo ? t.soloMode : t.deviceMode}</span>
          {#if solo}
            <!-- Offizielle Solo-Variante: Material aus dem Kartendeck -->
            <div class="seg spread">
              <button class:primary={soloMode === 'free'} onpointerup={() => setSoloMode('free')}>
                {t.soloFree}
              </button>
              <button class:primary={soloMode === 'daily'} onpointerup={() => setSoloMode('daily')}>
                📅 {t.soloDaily}
              </button>
              <button class:primary={soloMode === 'learn'} onpointerup={() => setSoloMode('learn')}>
                🎓 {t.learn.setupOption}
              </button>
            </div>
            {#if soloMode === 'daily'}
              <!-- Tageswahl: heute und die letzten Tage. Ohne sie käme man in
                   der installierten App an eine geteilte Challenge von gestern
                   gar nicht heran. -->
              <div class="dayPick">
                <button
                  class="iconBtn"
                  disabled={!canPrevDay}
                  title={t.dailyPrevDay}
                  onpointerup={() => stepDay(-1)}>‹</button>
                <span class="dayLabel">
                  📅 {dailyDate}{#if dailyDate === todayId()} · {t.dailyToday}{/if}
                </span>
                <button
                  class="iconBtn"
                  disabled={!canNextDay}
                  title={t.dailyNextDay}
                  onpointerup={() => stepDay(1)}>›</button>
              </div>
            {/if}
          {:else}
            <div class="seg spread">
              <button class:primary={!multiDevice} onpointerup={() => (multiDevice = false)}>
                {t.oneDevice}
              </button>
              <button class:primary={multiDevice} onpointerup={() => (multiDevice = true)}>
                {t.ownDevices}
              </button>
            </div>
          {/if}
          {#if landAllowed}
            <!-- Landpartie: 5×6 mit Landschaft — für jede Spielerzahl, alle
                 bekommen dieselbe Landschaft. Nur das Lernspiel bleibt bei
                 der 4×4-Klassik. -->
            <label class="opt landOpt">
              <input type="checkbox" bind:checked={landMode} />
              <span class="optText">
                <span class="optName">🏞 {t.landMode}</span>
                <span class="optDesc">{t.landModeHint}</span>
              </span>
            </label>
          {:else if landTooTight}
            <!-- Nicht stillschweigend weglassen: sagen, warum und was hilft -->
            <p class="hint landHint">🏞 {t.landPhoneLimit}</p>
          {/if}
          <p class="hint">
            {#if solo}
              {#if soloMode === 'daily'}{t.soloDailyHint}{/if}
              {#if soloMode === 'learn'}{t.learn.setupHint}{/if}
            {:else}
              {multiDevice ? t.ownDevicesHint : t.oneDeviceHint}
            {/if}
            <button class="link helpLink tapArea" onpointerup={() => (showHelp = true)}>
              📖 {t.helpButton}
            </button>
          </p>
        </div>

        <div class="stack players" style="grid-template-columns: {rowColumns}">
          {#each Array.from({ length: count }) as _, i}
            <div class="playerRow">
              <span class="nameField">
                <input
                  type="text"
                  bind:value={names[i]}
                  placeholder={t.defaultPlayer(i + 1)}
                  maxlength="14"
                  disabled={multiDevice && remote[i]}
                />
                {#if names[i] && !(multiDevice && remote[i])}
                  <button
                    class="clearName iconBtn"
                    title={t.clearName}
                    onpointerup={() => (names[i] = '')}
                  >✕</button>
                {/if}
              </span>
              <!-- Erst ab drei Spielern hat die Ecke eine Bedeutung: Zu zweit
                   sitzt man sich gegenüber (unten/oben), da gibt es nichts zu
                   wählen — vier Namen für zwei Plätze verwirrten nur. -->
              {#if eckenWahl}
                <select
                  value={corners[i]}
                  onchange={(e) => setCorner(i, Number((e.currentTarget as HTMLSelectElement).value))}
                >
                  {#each [0, 1, 2, 3] as c}
                    <option value={c}>{t.cornerNames[c]}</option>
                  {/each}
                </select>
              {/if}
              {#if multiDevice}
                <button
                  class="deviceToggle"
                  class:remote={remote[i]}
                  onpointerup={() => (remote[i] = !remote[i])}
                >
                  {remote[i] ? `📱 ${t.seatOwnDevice}` : `🏠 ${t.seatHere}`}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </section>

      <section class="card">
        <h2>{t.setupRules}</h2>

        <!-- Alle Schalter im selben Raster: Kästchen, Titel, Beschreibung
             beginnen auf derselben Linie und sind gleich breit. -->
        {#if dailyPur}
          <p class="hint dailyPureHint">📅 {t.dailyPure}</p>
        {:else}
          <label class="opt toggle">
            <input type="checkbox" bind:checked={useMonuments} />
            <span class="optText"><span class="optName">{t.useMonuments}</span></span>
          </label>
        {/if}

        <!-- Rathaus, Eisenbahn und Höhle: im Mehrspielerspiel auf beiden
             Brettern wählbar — die Landpartie ist nur ein anderes Brett. -->
        {#if !solo}
          <label class="opt toggle">
            <input type="checkbox" bind:checked={townHall} />
            <span class="optText">
              <span class="optName">🏛 {t.townHallMode}</span>
              <span class="optDesc">{t.townHallModeHint}</span>
            </span>
          </label>
          <label class="opt toggle">
            <input type="checkbox" bind:checked={train} />
            <span class="optText">
              <span class="optName">🚂 {t.trainMode}</span>
              <span class="optDesc">{t.trainModeHint}</span>
            </span>
          </label>
          <label class="opt toggle">
            <input type="checkbox" bind:checked={cavernRule} />
            <span class="optText">
              <span class="optName">{t.cavernRule}</span>
              <span class="optDesc">{t.cavernRuleHint}</span>
            </span>
          </label>
        {/if}

        {#if !dailyPur}
        <div class="expansions">
          <span class="expTitle">{t.expansions}</span>
          {#each SETS.filter((s) => !s.core) as set}
            <label class="opt toggle expRow">
              <input
                type="checkbox"
                checked={chosenSets.includes(set.id)}
                onchange={() => toggleSet(set.id)}
              />
              <span class="optText">
                <span class="optName">{t.sets[set.id]?.name ?? set.name}</span>
                <span class="optDesc">{t.sets[set.id]?.description ?? set.description}</span>
              </span>
            </label>
          {/each}
        </div>
        {/if}
      </section>

      <!-- Hinweis aufs Originalspiel: bewusst am Ende, hinter allem, was zum
           Spielen nötig ist. Kein Skript, nur ein Link. -->
      <BuyOriginal />
    </div>
  </div>

  <!-- Startleiste: liegt außerhalb des scrollenden Bereichs und ist damit
       auf jedem Gerät sichtbar, egal wie lang die Einstellungen werden. -->
  <div class="bar">
    {#if error}<div class="error">{error}</div>{/if}
    {#if multiDevice}
      <button class="primary big" disabled={busy} onpointerup={openRoom}>{t.openRoom}</button>
    {:else}
      <button class="primary big" onpointerup={start}>{t.startGame}</button>
    {/if}
    <div class="barLinks">
      <button class="link tapArea" onpointerup={onjoin}>{t.joinTitle} →</button>
      <CreditsFooter />
    </div>
  </div>
</main>

{#if showHelp}
  <HelpDialog
    mode={solo ? 'solo' : multiDevice ? 'host' : 'single'}
    onclose={() => (showHelp = false)}
  />
{/if}

<style>
  main {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  /* Nur dieser Teil scrollt — die Startleiste bleibt stehen. */
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    touch-action: pan-y;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 8px 12px 16px;
  }
  /* Auto-Ränder zentrieren, solange Platz ist, und scrollen sauber, wenn nicht.
     Mit justify-content:center würde überlaufender Inhalt oben abgeschnitten. */
  .scroll > :first-child { margin-top: auto; }
  .scroll > :last-child { margin-bottom: auto; }

  .langRow {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 12px 0;
  }
  h1 { margin: 0; font-size: clamp(26px, 6vw, 34px); }

  .cards {
    display: grid;
    grid-template-columns: minmax(0, 420px);
    justify-content: center;
    align-items: start;
    gap: 14px;
    width: 100%;
  }
  /* Ab dieser Breite passen zwei Spalten nebeneinander — auf dem Tablet
     entfällt das Scrollen damit ganz, quer am Handy halbiert es die Länge.
     Der Lernhinweis legt sich dann in eine Zeile, statt drei zu belegen. */
  @media (min-width: 720px) {
    .cards { grid-template-columns: repeat(2, minmax(0, 420px)); }
  }
  /* Quer am Handy ist Höhe knapp: Kopfbereich schrumpft, damit von den
     Einstellungen noch etwas zu sehen ist. */
  @media (max-height: 560px) {
    .scroll { gap: 10px; }
    h1 { font-size: var(--fs-xl); }
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--bg-panel);
    padding: 18px 20px 20px;
    border-radius: var(--r-lg);
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .row { display: flex; align-items: center; gap: 12px; }
  .stack { display: flex; flex-direction: column; gap: 8px; }
  /* Ein Raster über alle Spielerzeilen: Namensfeld, Ecke und Geräte-Knopf
     stehen damit in jeder Zeile exakt untereinander — unabhängig davon, wie
     lang die einzelnen Beschriftungen sind. */
  .players {
    display: grid; /* Spaltenzahl kommt aus rowColumns */
    gap: 8px 10px;
    align-items: center;
  }
  .playerRow { display: contents; }
  .label { flex: 1; }

  .seg { display: flex; gap: 6px; }
  .row .seg button { width: 46px; }
  /* Modus-Knöpfe teilen sich die Zeile gleichmäßig, statt den Titel zu quetschen */
  .seg.spread button { flex: 1 1 0; min-width: 0; font-size: var(--fs-sm); padding: 8px 6px; }

  /* Tageswahl der Challenge: Pfeile links und rechts, Datum in der Mitte */
  .dayPick {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .dayPick button:disabled { opacity: 0.35; }
  .landHint { margin: 0; }
  .dailyPureHint { margin: 0; }
  .dayLabel {
    font-size: var(--fs-md);
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    min-width: 11ch;
    text-align: center;
  }
  .hint { margin: 0; font-size: var(--fs-xs); color: var(--text-dim); line-height: 1.4; }

  /* Namensfeld mit Löschknopf: Der Knopf liegt IM Feld, damit die Spalte
     ihre Breite behält und die Zeilen weiter untereinander stehen. */
  .nameField { position: relative; display: flex; min-width: 0; }
  .nameField input { padding-right: 46px; }
  .clearName {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: var(--fs-sm);
    border-radius: var(--r-md);
  }
  .playerRow input {
    flex: 1;
    font: inherit;
    color: inherit;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: var(--r-md);
    padding: 8px 10px;
    min-width: 0;
  }
  .playerRow select {
    font: inherit;
    color: inherit;
    background: var(--bg);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: var(--r-md);
    padding: 8px;
  }
  .playerRow input:disabled { opacity: 0.45; }
  .deviceToggle { font-size: var(--fs-xs); padding: 6px 8px; white-space: nowrap; width: 100%; }
  .deviceToggle.remote { border-color: var(--accent); color: var(--accent); }

  /* Einheitliches Raster für jeden Schalter */
  .opt {
    min-height: var(--tap);
    align-content: center;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    cursor: pointer;
  }
  .opt input { width: 22px; height: 22px; margin: 0; }
  .optText { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .optName { font-weight: 600; line-height: 1.25; }
  .optDesc { font-size: var(--fs-xs); color: var(--text-dim); line-height: 1.35; }

  .expansions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    padding-top: 12px;
  }
  .expTitle { font-size: var(--fs-sm); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); }

  .bar {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 12px var(--safe-bottom);
    background: var(--bg-panel);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.35);
  }
  .big { font-size: var(--fs-lg); padding: 12px; width: min(420px, 100%); }
  .barLinks { display: flex; align-items: center; gap: 14px; }
  .error { color: var(--danger); font-size: var(--fs-sm); text-align: center; }

  .link {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: var(--fs-sm);
    padding: 0;
    text-decoration: underline;
  }
  .helpLink { font-size: var(--fs-sm); padding: 0 0 0 8px; }

  /* Hinweis auf den Lernmodus (nur bis zum ersten Wegklicken) */
  .learnHint {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
    width: min(420px, 100%);
    background: var(--bg-panel);
    border: 1px solid var(--accent);
    border-radius: var(--r-lg);
    padding: 14px 18px;
  }
  .hintTitle { font-size: var(--fs-md); font-weight: 700; color: var(--accent); }
  .hintText { margin: 0; font-size: var(--fs-sm); line-height: 1.45; color: var(--text-dim); padding-right: 22px; }
  .hintStart { font-size: var(--fs-sm); padding: 8px 14px; }
  .hintClose {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: 50%;
    font-size: var(--fs-sm);
    line-height: 1;
    opacity: 0.6;
  }

  /* Auf breiten Geräten legt sich der Hinweis in eine Zeile und nimmt
     dieselbe Breite ein wie die beiden Karten darunter. */
  @media (min-width: 720px) {
    .learnHint {
      width: min(854px, 100%);
      flex-direction: row;
      align-items: center;
      gap: 14px;
      padding-right: 40px; /* Platz für das ✕ in der Ecke */
    }
    .hintTitle { white-space: nowrap; }
    .hintText { flex: 1; padding-right: 0; }
    .hintStart { flex-shrink: 0; }
  }
  @media (max-height: 560px) {
    .learnHint { padding: 10px 14px; }
  }

  /* Installations-Hinweis: dieselbe Breite wie die Karten, aber zurückhaltend
     gezeichnet — er soll den Lernhinweis nicht überstrahlen. */
  .installHint {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px 14px;
    width: min(420px, 100%);
    background: var(--bg-panel);
    border: 1px dashed rgba(255, 255, 255, 0.28);
    border-radius: var(--r-lg);
    padding: 12px 40px 12px 16px;
  }
  .installText { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .installTitle { font-size: var(--fs-sm); font-weight: 700; }
  .installSub { font-size: var(--fs-xs); color: var(--text-dim); line-height: 1.35; }
  .installGo { font-size: var(--fs-sm); padding: 7px 12px; white-space: nowrap; }
  .installSteps {
    grid-column: 1 / -1;
    margin: 0;
    padding-left: 20px;
    font-size: var(--fs-xs);
    color: var(--text-dim);
    line-height: 1.6;
  }
  .shareIcon {
    width: 0.75em;
    height: 0.95em;
    vertical-align: -0.15em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (min-width: 720px) {
    .installHint { width: min(854px, 100%); }
  }
</style>
