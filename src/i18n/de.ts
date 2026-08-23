// UI-Texte (Deutsch). Kartentexte kommen aus den JSON-Assets (name.de / text.de).

export const t = {
  appTitle: 'Tiny Towns',
  newGame: 'Neues Spiel',
  resumeGame: 'Weiterspielen',
  players: 'Spieler',
  playerName: 'Name',
  corner: 'Ecke',
  useMonuments: 'Mit Monumenten spielen',
  startGame: 'Los geht’s!',
  cornerNames: ['unten links', 'unten rechts', 'oben rechts', 'oben links'],

  masterBuilder: 'Baumeister',
  pickResource: 'Wähle ein Baumaterial',
  resourceNames: {
    wood: 'Holz',
    brick: 'Ziegel',
    stone: 'Stein',
    wheat: 'Weizen',
    glass: 'Glas'
  } as Record<string, string>,

  placeHint: 'Ziehe das Material auf ein freies Feld',
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

  waitingForOthers: 'Warte auf die anderen …',
  townComplete: 'Stadt fertig',
  round: 'Runde',

  scoreTitle: 'Endwertung',
  scoreEmpty: 'Leere Felder',
  scoreTotal: 'Gesamt',
  scoreFed: 'gefütterte Hütten',
  winner: 'Gewinner',
  playAgain: 'Neue Partie',

  confirmAbort: 'Laufende Partie verwerfen?',
  abortGame: 'Partie beenden'
};
