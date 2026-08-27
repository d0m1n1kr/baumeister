// UI-Texte (Deutsch) — die Referenz: `Translation` wird von diesem Objekt
// abgeleitet, alle anderen Sprachen müssen exakt dieselben Schlüssel liefern.
// Kartentexte kommen aus den JSON-Assets (name/text je Sprache, Fallback en→de).

export const de = {
  languageName: 'Deutsch',
  themeLabel: 'Thema',
  themeClassic: 'Wald-Städtchen',
  themeMars: 'Mars-Kolonie',
  themeFantasy: 'Drachenreich',
  language: 'Sprache',
  appTitle: 'Tiny Towns',
  newGame: 'Neues Spiel',
  resumeGame: 'Weiterspielen',
  players: 'Spieler',
  clearName: 'Namen löschen',
  playerName: 'Name',
  corner: 'Ecke',
  useMonuments: 'Mit Monumenten spielen',
  startGame: 'Los geht’s!',
  cornerNames: ['unten links', 'unten rechts', 'oben rechts', 'oben links'],

  masterBuilder: 'Baumeister',
  pickResource: 'Wähle ein Baumaterial',
  /* Erklärungen der Effektzeichen auf den Karten. Vorher standen sie hart
     auf Deutsch in helpers.ts — sieben von acht Sprachen lasen Deutsch. */
  features: {
    feedable: 'Muss gefüttert werden',
    feeds: 'Füttert Hütten',
    adjacency: 'Nachbarschaft zählt',
    noAdjacency: 'Bestimmte Nachbarn vermeiden',
    rowCol: 'Zeile & Spalte zählen',
    corners: 'Ecken zählen',
    center: 'Zentrum zählt',
    countTable: 'Punkte nach Anzahl',
    holdsResource: 'Lagert Material',
    wildResource: 'Joker-Material',
    interactive: 'Laufender Effekt',
    onConstruct: 'Effekt beim Bau',
    placementOverride: 'Freie Platzwahl',
    negativeVp: 'Minuspunkte möglich',
    vsNeighbor: 'Vergleich mit Nachbar',
    townSnapshot: 'Zeitpunkt des Baus zählt',
    finishOrder: 'Fertigstellungs-Reihenfolge',
    emptyOk: 'Leere Felder erlaubt',
    uniqueTypes: 'Verschiedene Typen zählen',
    coins: 'Münz-Effekt'
  } as Record<string, string>,
  unverified: 'Kartendetails nicht verifiziert',
  flipToOpponent: 'Zum Gegenüber drehen',

  resourceNames: {
    wood: 'Holz',
    brick: 'Ziegel',
    stone: 'Stein',
    wheat: 'Weizen',
    glass: 'Glas'
  } as Record<string, string>,

  placeHint: 'Tippe oder ziehe das Material auf ein freies Feld',
  moveHint: 'Tippe ein anderes freies Feld, um das Material zu verschieben',
  buildMode: 'Bauen',
  cancel: 'Abbrechen',
  confirm: 'Bestätigen',
  close: 'Schließen',
  skip: 'Überspringen',
  roundDone: 'Fertig',
  chooseBuildTarget: 'Wähle das Feld für das Gebäude',
  declareComplete: 'Stadt fertigstellen',
  declareCompleteTitle: 'Stadt fertigstellen?',
  declareCompleteText:
    'Deine Stadt hat keine freien Felder mehr. Wenn du fertigstellst, erhältst du keine Baumaterialien mehr und kannst nicht mehr bauen.',

  monument: 'Monument',
  monumentDraftButton: 'Monument wählen',
  monumentChosen: 'Monument gewählt',
  monumentRevealTitle: 'Monument ansehen?',
  monumentRevealText: 'Alle anderen Spieler bitte wegschauen!',
  monumentPick: 'Wähle 1 von 2 Monumenten',
  monumentBuilt: 'gebaut',

  factorySwap: 'Fabrik-Tausch',
  factorySwapHint: 'Nimm ein anderes Material statt des angesagten',
  warehouseTitle: 'Lagerhaus',
  warehouseStore: 'Einlagern',
  warehouseSwapHint: 'Tippe ein eingelagertes Material zum Tauschen',
  markResourceTitle: 'Material auf das Gebäude legen',
  groveTitle: 'Hain-Universität: Gratis-Gebäude wählen',
  guildTitle: 'Architektengilde: Gebäude ersetzen',
  guildPickBuilding: 'Tippe ein Gebäude, das ersetzt werden soll',
  guildPickNew: 'Neues Gebäude wählen',
  opaleyeSetupTitle: 'Opaleyes Wacht: Gebäude bevorraten',
  opaleyeClaimTitle: 'Opaleyes Wacht: Gebäude erhalten?',
  opaleyeClaimText: 'Ein Nachbar hat einen bevorrateten Typ gebaut. Auf ein freies Feld platzieren?',
  choosePlacement: 'Wähle ein freies Feld',
  accept: 'Annehmen',
  decline: 'Ablehnen',

  install: {
    title: 'Als App installieren',
    text: 'Startet ohne Browserleiste und funktioniert offline.',
    action: 'Installieren',
    how: 'Wie?',
    iosStep1: 'Unten auf Teilen tippen',
    iosStep2: 'Dann „Zum Home-Bildschirm"'
  },
  setupGame: 'Partie',
  setupRules: 'Regeln & Varianten',
  expansions: 'Erweiterungen',
  coinIcon: '🪙',
  coins: 'Münzen',
  coinSwap: 'Münze: anderes Material',
  coinSwapHint: 'Zahle 1 Münze und nimm ein beliebiges anderes Material',
  masonsTitle: 'Steinmetzgilde: je 1 Münze → 1 Gebäude',
  promenadeTitle: 'Blütenpromenade: Münzen auf leere Felder legen',
  museumSell: 'Angesagtes Material zurückgeben (+1 Münze)',
  museumContents: 'Auf dem Museum liegt:',
  museumStockTitle: 'Museum: Material auflegen',
  cathedralTitle: 'Kathedrale: 3 Münzen zahlen?',
  cathedralPay: '3 Münzen zahlen',
  cathedralTransform: (name: string) => `In ${name} umwandeln (Feld wählen)`,
  cathedralTransformHere: (name: string) => `In ${name} umwandeln`,
  okaverTitle: 'Schatzkammer: Truhe voll → Gratis-Hütte?',
  semaphoreSkipHint: 'Zusatz-Material (Semaphor) verfällt mit „Fertig"',
  oddityTakeTitle: 'Kuriositätenladen: Material nehmen (+1 Münze für dich)',
  oddityStoreHint: 'Auf den Kuriositätenladen gelegt',
  seedPlaceHint: 'Tippe ein Feld für deinen Samen',
  seedBonusTitle: 'Samen überbaut: Gratis-Material wählen',
  tree: 'Baum',
  prismToggle: 'Prismenschmiede: Material liegen lassen',
  waitingForOthers: 'Warte auf die anderen …',
  townComplete: 'Stadt fertig',
  round: 'Runde',

  scoreTitle: 'Endwertung',
  scoreEmpty: 'Leere Felder',
  scoreTotal: 'Gesamt',
  scoreFed: 'gefütterte Hütten',
  winner: 'Gewinner',
  shareButton: 'Ergebnis teilen',
  shareImageButton: 'Als Bild teilen',
  shareCopied: 'In die Zwischenablage kopiert',
  shareFailed: 'Teilen hat nicht geklappt',
  playAgain: 'Neue Partie',

  aliceMode: 'Alice-Modus',
  aliceModeHint: 'Alle Karten dauerhaft mit Beschreibung zeigen',
  flipCards: 'Kartenauslage für die Gegenseite drehen',

  townHallMode: 'Rathaus-Modus',
  townHallModeHint: 'Ohne Baumeister: Ein Materialdeck bestimmt die Runden, jede 3. Runde wählt jeder frei.',
  trainMode: 'Eisenbahn-Modus',
  trainModeHint: 'Ein Zug mit 3 Waggons fährt Runde für Runde um den Tisch — mit gebautem Bahnhof darfst du Material verladen oder tauschen.',
  trainStopTitle: 'Der Zug hält an deinem Bahnhof!',
  trainLoad: 'In den Zug verladen',
  trainSwapHint: 'Gegen den Waggon-Inhalt tauschen',
  trainAt: (name: string) => `Der Zug hält bei ${name}`,
  trainPassing: (name: string) => `Der Zug hält bei ${name} (kein Bahnhof)`,
  trainTunnel: 'Der Zug ist im Tunnel',
  thDraw: 'Nächste Karte ziehen',
  thStartFree: 'Runde starten: freie Wahl',
  thDeckCount: (n: number) => `Nachziehstapel: ${n} Karten`,
  thFreePick: 'Freie Wahl: Material aussuchen',
  thFortSkip: 'Fort Eisenkraut: setzt in dieser Runde aus',

  cavernRule: 'Höhlen-Regel',
  cavernRuleHint: 'Bis zu 2 fremd angesagte Materialien pro Partie beiseitelegen (zählen am Ende nicht).',
  cavernButton: 'In die Höhle',

  confirmAbort: 'Laufende Partie verwerfen?',
  abortGame: 'Partie beenden',

  deviceMode: 'Wie wird gespielt?',
  oneDevice: 'An einem Gerät',
  oneDeviceHint: 'Reihum am selben Gerät — funktioniert ohne Internet.',
  ownDevices: 'Mit eigenen Geräten',
  ownDevicesHint: 'Mitspieler treten mit Handy oder Tablet bei. Monumente bleiben dabei wirklich geheim.',
  seatHere: 'hier',
  seatOwnDevice: 'eigenes Gerät',
  openRoom: 'Raum öffnen',
  lobbyTitle: 'Warten auf Mitspieler',
  roomCode: 'Raum-Code',
  scanHint: 'Mit der Kamera scannen oder den Code eintippen',
  joinTitle: 'Partie beitreten',
  joinCode: 'Raum-Code',
  yourName: 'Dein Name',
  joinButton: 'Beitreten',
  qrLabel: 'QR-Code zum Beitreten',
  scanButton: 'QR-Code scannen',
  scanTitle: 'QR-Code scannen',
  scanPrompt: 'Den QR-Code des Hosts vor die Kamera halten',
  cameraError: 'Kamera nicht verfügbar — Zugriff erlauben oder den Code eintippen.',
  scanInvalid: 'Kein Tiny-Towns-Beitrittscode',
  connecting: 'Verbinde …',
  relayStatus: (open: number, total: number) => `Vermittlung: ${open}/${total} Relays erreichbar`,
  waitingForHost: 'Warte auf den Start durch den Host …',
  connected: 'verbunden',
  disconnected: 'getrennt',
  waiting: 'wartet',
  takeOverSeat: 'Platz übernehmen',
  startWithConnected: 'Spiel starten',
  needAllSeats: 'Es fehlen noch Mitspieler',
  leaveRoom: 'Raum verlassen',
  hostStaysAwake: 'Dieses Gerät bitte entsperrt lassen — es führt die Partie.',
  reconnecting: 'Verbindung unterbrochen — versuche erneut …',
  handoverTitle: 'Geräte & Plätze',
  handoverHint: 'Code scannen und beitreten — ein freier Platz wird automatisch zugeteilt, auch mitten im Spiel.',
  releaseSeat: 'Per QR übergeben',
  releaseForNewDevice: 'Für neues Gerät freigeben',
  seatFree: 'frei — wartet auf Gerät',
  myBoard: 'Mein Brett',
  tableView: 'Spieltisch',

  soloMode: 'Solo',
  soloOfferTitle: 'Wähle 1 der 3 ausliegenden Materialien',
  soloDeckCount: (n: number) => `Nachziehstapel: ${n} Karten`,
  soloDaily: 'Tages-Challenge',
  soloDailyHint: 'Fester Zufall des Tages — weltweit dieselben Karten und Materialien. Vergleiche deine Punkte!',
  soloLand: 'Landpartie (6×6)',
  soloLandHint: 'Größeres Brett mit Fluss, Bergen und See — unbebaubar, aber Anlieger-Karten bringen dort Punkte.',
  soloLandNoSets: 'Die Landpartie spielt pur: Basisspiel plus Anlieger-Karten, ohne Erweiterungen.',
  landHighscores: 'Bestenliste Landpartie (dieses Gerät)',
  terrain: {
    river: 'Fluss',
    mountain: 'Berge',
    lake: 'See'
  },
  dailyPrevDay: 'Tag zurück',
  dailyNextDay: 'Tag vor',
  dailyToday: 'heute',
  soloFree: 'Freies Solo',
  soloRankTitle: 'Dein Rang',
  soloHighscores: 'Bestenliste (dieses Gerät)',
  soloNewBest: 'Neuer Platz {n} in der Bestenliste!',

  soundOn: 'Ton einschalten',
  soundOff: 'Ton ausschalten',

  helpButton: 'Kurzanleitung',
  help: {
    roundTitle: 'So läuft eine Runde',
    roundSteps: [
      'Der Baumeister (👑) sagt ein Material an — alle Spieler erhalten es.',
      'Jeder legt es per Tipp oder Ziehen auf ein freies Feld (bis „Fertig" noch verschiebbar).',
      'Passt ein Baumuster: „🔨 Bauen" → Felder markieren → Karte wählen → Bauplatz antippen. Beliebig oft pro Runde.',
      '„✓ Fertig" beendet deine Runde — sind alle fertig, wandert die Krone weiter.',
      'Ist deine Stadt voll und nichts mehr baubar, erklärst du sie für fertig. Am Ende wertet die App automatisch.'
    ],
    cavernNote: 'Höhlen-Regel (falls im Setup aktiviert): 2× pro Partie darfst du ein fremd angesagtes Material in die Höhle legen statt es zu platzieren.',
    townhallTitle: 'Rathaus-Modus (falls im Setup aktiviert)',
    townhallSteps: [
      'Niemand ist Baumeister: Ein Materialdeck (15 Karten, 3 je Sorte) entscheidet — 5 Karten werden zu Beginn verdeckt abgeworfen.',
      'Der Bürgermeister (🏛) zieht in zwei Runden je 1 Karte: Alle platzieren dieses Material. Jede 3. Runde wählt stattdessen jeder frei aus dem Vorrat.',
      'Ist der Stapel leer, wird der Abwurf neu gemischt und wieder 5 Karten verdeckt abgeworfen. Mitzählen lohnt sich!',
      'Fabrik, Lagerhaus, Münztausch & Co. wirken auf gezogene Karten; die Bank sperrt die freie Wahl, Fort Eisenkraut setzt in Wahlrunden aus.',
      'Mit Fortune ist der Kuriositätenladen aus dem Spiel.'
    ],
    trainTitle: 'Eisenbahn-Modus (falls im Setup aktiviert)',
    trainSteps: [
      'Die Gleise verlaufen am unteren und oberen Spielfeldrand, mit Tunneln an den Enden. Der Zug (3 Waggons hinter der Lok) ist samt Beladung immer sichtbar.',
      'Am Ende jeder Runde fährt er eine Position weiter und hält an jeder Stadt; ein Streckenabschnitt führt durch den Tunnel — dadurch verschieben sich Zug und Baumeister gegeneinander (solo taucht er alle 3 Runden auf).',
      'Der Bahnhof liegt als 8. Karte für alle aus (Stein–Holz–Stein, 2 Punkte, höchstens einer pro Stadt) und muss an der Strecke gebaut werden — in der untersten Reihe deiner Stadt.',
      'Nur mit Bahnhof darfst du beim Halt statt zu platzieren: das erhaltene Material in einen freien Waggon verladen — oder gegen einen Waggon-Inhalt tauschen (das getauschte platzierst du normal).',
      'Die Waggons sind öffentlich: Was du abgibst, kann unterwegs jemand anderes wegschnappen.'
    ],
    fortuneTitle: 'Erweiterung: Fortune (Münzen)',
    fortuneSteps: [
      'Baust du in einer Runde 2 oder mehr Gebäude (mit Materialentfernen), erhältst du 1 Münze — die Truhe fasst höchstens 4 (manche Monumente geben 1 Extra-Platz).',
      'Bei fremder Ansage kannst du 1 Münze zahlen und stattdessen ein beliebiges anderes Material nehmen (🪙-Knopf am Material-Chip).',
      'Am Spielende ist jede Münze in der Truhe 1 Punkt wert.',
      'Dazu kommen 12 Fortune-Gebäude und 10 Monumente mit Münz-Effekten — alle nach den offiziellen Kartentexten umgesetzt.'
    ],
    treesTitle: 'Erweiterung: Tiny Trees (Samen)',
    treesSteps: [
      'Jeder Spieler legt zu Beginn einen Samen auf ein freies Feld seines Bretts.',
      'Wird der Samen überbaut, wählst du ein Gratis-Material und platzierst es sofort.',
      'Bleibt der Samen bis zum Schluss als letztes unbebautes Feld liegen, wächst er zum Baum: 2 Punkte.'
    ],
    soloTitle: 'Solo (offizielle Variante)',
    soloSteps: [
      '15 Material-Karten (3 je Sorte) sind gemischt, 3 liegen offen aus.',
      'Jede Runde wählst du EINE der drei — die gewählte Karte wandert verdeckt unter den Stapel, von oben wird nachgezogen. Mitzählen lohnt sich!',
      'Gasthaus, Bank, Fort Eisenkraut und Opaleyes Wacht sind aus dem Spiel (mit Fortune auch Kuriositätenladen, Schulhaus und Semaphor; der Juwelier braucht 1 Münze).',
      'Deine Deck-Wahl gilt als „fremde Ansage": Fabrik, Münztausch, Museum, Promenade und Bondmaker funktionieren damit ganz normal.',
      'Am Ende zeigt die Wertung deinen Rang (bis „Meister-Architekt" ab 38 Punkten) und die Bestenliste dieses Geräts.',
      'Tages-Challenge: fester Zufall des Tages — weltweit dieselben Karten. Vergleicht eure Punkte!'
    ],
    singleTitle: 'An einem Gerät',
    singleSteps: [
      'Spieler, Namen und Ecken wählen — jede Ecke ist zum jeweiligen Spieler gedreht, alle spielen gleichzeitig.',
      'Karten antippen vergrößert sie, gedreht zum Antipper (⟳ dreht zum Gegenüber).',
      'Monumente bleiben geheim: Vor dem Aufdecken bestätigen, dass die anderen wegschauen.',
      'Die Partie speichert sich selbst — nach einem Neustart einfach „Weiterspielen".'
    ],
    hostTitle: 'Mit eigenen Geräten (Host)',
    hostSteps: [
      '„Raum öffnen" — Mitspieler scannen den QR-Code oder tippen den 6-stelligen Code ein.',
      'Plätze lassen sich mischen: einige spielen hier am Gerät, andere auf ihrem eigenen.',
      'Dieses Gerät führt die Partie: entsperrt und im Vordergrund lassen.',
      'Im Spiel zeigt „⌗ Raum-Code" jederzeit QR und Plätze — dort Plätze an Geräte übergeben oder hierher übernehmen.',
      'Nach einem Neustart stellt „Weiterspielen" Partie und Raum wieder her; die Gäste verbinden sich von selbst.'
    ],
    guestTitle: 'Beitreten mit eigenem Gerät',
    guestSteps: [
      'QR-Code scannen oder Raum-Code eintippen, Namen wählen — dein Platz kommt automatisch.',
      'Du siehst dein Brett groß, die Gegner klein; dein Monument liegt für dich offen.',
      '„📖 Alice-Modus" zeigt alle Karten dauerhaft mit Beschreibung.',
      'Kurz weg oder neu geladen? Die App tritt automatisch wieder bei. Klappt es nicht: Host-Gerät wecken oder dort den Platz neu vergeben lassen.'
    ]
  },

  /** Lernmodus (Solo): Erklärblasen je Phase + Zugvorschläge. Absichtlich
   *  themeneutral formuliert (keine Hütten, Städte, Münzen, Bahnhöfe) —
   *  deshalb braucht kein Theme eigene Lerntexte; geprüft in ui/learn.test.ts. */
  learn: {
    mode: 'Lernmodus',
    modeHint: 'Erklärungen zu jeder Phase und Zugvorschläge',
    setupOption: 'Lernspiel',
    setupHint: 'Erklärblasen führen durch jede Phase, schlagen Züge vor und sagen, was mit mehreren Spielern anders läuft.',
    hintTitle: 'Zum ersten Mal hier?',
    hintText: 'Der Lernmodus erklärt jede Phase, schlägt Züge vor und sagt, was mit mehreren Spielern anders läuft.',
    hintStart: 'Lernspiel starten',
    gotIt: 'Verstanden',
    hideTips: 'Tipps aus',
    multiplayer: 'Mit mehreren Spielern',
    suggestion: 'Vorschlag',
    suggestCompletes: (card: string) => `markiertes Feld — damit ist ${card} vollständig`,
    suggestTowards: (card: string, have: number, need: number) =>
      `markiertes Feld — ${have} von ${need} Feldern für ${card}`,
    suggestBuild: (card: string) => `${card} ist vollständig — jetzt baubar`,
    multiTitle: 'Was mit mehreren Spielern anders ist',
    multiSteps: [
      'Zu zweit bis viert füllt jeder seine eigenen 16 Felder — gleichzeitig, niemand wartet auf einen Zug.',
      'Statt des Decks sagt der Baumeister (👑) das Material für alle an; die Krone wandert jede Runde weiter.',
      'Karten, die bei fremder Ansage tauschen oder Material aufnehmen, wirken nur dann — als Baumeister gehst du leer aus. Solo galt deine Deck-Wahl immer als fremd.',
      'Vier Karten kommen erst mit Mitspielern ins Spiel (mit Fortune drei weitere) — sie brauchen Nachbarn.',
      'Monumente bleiben geheim: an einem Gerät bestätigt man „alle wegschauen", auf eigenen Geräten sieht es niemand sonst.',
      'Die Partie endet, wenn alle abgeschlossen haben; es gewinnt die höchste Punktzahl, bei Gleichstand wer seltener Baumeister war.',
      'Nur mit mehreren Spielern gibt es zusätzlich den Rathaus-Modus und die Höhlen-Regel.'
    ],
    steps: {
      welcome: {
        title: '4 × 4 Felder',
        body: 'Jede Runde bekommst du ein Material. Passen die Materialien auf dem Brett zum Muster einer Karte, kannst du sie bauen.',
        mp: 'Zu zweit bis viert füllt jeder sein eigenes Brett — gleichzeitig, an einem Gerät oder auf eigenen Geräten.'
      },
      monument: {
        title: 'Monument wählen',
        body: 'Du bekommst zwei Monumente und behältst eines. Punkte bringt es nur, wenn du es bis zum Ende fertig baust.',
        mp: 'Dort bleibt es geheim: an einem Gerät bestätigst du vor dem Ansehen, dass alle wegschauen; auf eigenen Geräten bekommt es niemand sonst zu sehen.'
      },
      seed: {
        title: 'Samen setzen',
        body: 'Lege den Samen auf ein freies Feld. Überbaust du ihn später, wählst du ein Gratis-Material dazu.',
        mp: 'Alle setzen ihren Samen gleichzeitig, jeder auf seinem eigenen Brett.'
      },
      select: {
        title: 'Felder markieren',
        body: 'Tippe genau die Felder an, die das Muster der Karte bilden — nicht mehr und nicht weniger. Gedreht und gespiegelt ist immer erlaubt.',
        mp: 'Genauso wie hier.'
      },
      target: {
        title: 'Bauplatz wählen',
        body: 'Tippe das Feld an, auf dem die Karte stehen soll. Es muss eines der markierten Materialfelder sein — die Materialien darunter verschwinden.',
        mp: 'Genauso wie hier; einzelne Karten erlauben stattdessen ein beliebiges freies Feld.'
      },
      train: {
        title: 'Halt bei dir',
        body: 'Statt zu platzieren darfst du das Material abgeben oder gegen die Ladung tauschen — dafür brauchst du die passende Karte an der Strecke.',
        mp: 'Die Ladung ist öffentlich: Was du abgibst, kann unterwegs jemand anderes mitnehmen.'
      },
      swap: {
        title: 'Tauschen statt platzieren',
        body: 'Eine deiner Karten erlaubt, dieses Material gegen ein anderes zu tauschen. Das getauschte platzierst du normal.',
        mp: 'Das geht nur bei fremder Ansage. Solo gilt deine Deck-Wahl als fremd — als Baumeister mit mehreren Spielern darfst du nicht tauschen.'
      },
      offer: {
        title: 'Material aus dem Deck',
        body: 'Drei Karten liegen offen. Die gewählte wandert verdeckt unter den Stapel, eine neue kommt nach — Mitzählen lohnt sich.',
        mp: 'Dort gibt es kein Deck: Der Baumeister (👑) sagt ein Material für alle an, danach wandert die Krone weiter.'
      },
      place: {
        title: 'Material platzieren',
        body: 'Tippe oder ziehe es auf ein freies Feld. Bis „Fertig" darfst du es noch verschieben.',
        mp: 'Alle bekommen dasselbe Material und platzieren gleichzeitig.'
      },
      build: {
        title: 'Bauen',
        body: '„🔨 Bauen" öffnet den Bau-Modus. Pro Runde darfst du so oft bauen, wie du Muster zusammenbekommst.',
        mp: 'Genauso wie hier — jeder baut nur auf seinem eigenen Brett.'
      },
      complete: {
        title: 'Abschließen',
        body: 'Kein freies Feld mehr und nichts mehr baubar? Dann schließt du ab und die Wertung beginnt.',
        mp: 'Die Partie endet erst, wenn alle abgeschlossen haben; wer schon fertig ist, bekommt kein Material mehr.'
      },
      done: {
        title: 'Runde beenden',
        body: '„✓ Fertig" schließt deine Runde ab — das platzierte Material liegt dann endgültig.',
        mp: 'Die Runde wechselt erst, wenn alle fertig sind; dann wandert die Krone weiter.'
      }
    }
  },

  points: 'Punkte',
  defaultPlayer: (n: number) => `Spieler ${n}`,
  needLocalSeat: 'Mindestens ein Platz muss an diesem Gerät bleiben.',

  /** Anzeige der Karten-Sets (Setup-Bildschirm). */
  sets: {
    base: { name: 'Basisspiel', description: '25 Gebäude + 15 Monumente' },
    fortune: {
      name: 'Fortune',
      description: 'Münzen: 1 Münze bei 2+ Bauten pro Runde; 1 Münze zahlen, um ein anderes Material zu nehmen. 12 Gebäude + 10 Monumente.'
    },
    tiny_trees: {
      name: 'Tiny Trees',
      description: 'Mini-Erweiterung: Jeder startet mit einem Samen. Überbauen bringt ein Gratis-Material; als letzter freier Platz wird er ein Baum (2 Punkte).'
    }
  } as Record<string, { name: string; description: string }>,

  /** Offizielle Solo-Ränge, bester zuerst (Index aus soloRankIndex). */
  soloRanks: [
    'Meister-Architekt', 'Stadtplaner', 'Ingenieur',
    'Zimmermann', 'Baulehrling', 'Angehender Architekt'
  ],

  /** Übersetzungen der Engine-/Netz-Meldungen (Schlüssel = deutscher Originaltext).
   *  Für Deutsch leer — unbekannte Schlüssel fallen auf das Original zurück. */
  errors: {} as Record<string, string>,

  updateAvailable: 'Neue Version verfügbar',
  updateNow: 'Aktualisieren',
  updateLater: 'Später',
  updateCheck: 'Nach Update suchen',
  updateCurrent: 'aktuell',
  offlineReady: 'Bereit für Offline-Spiel'
};
