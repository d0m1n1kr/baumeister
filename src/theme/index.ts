// Themes: reine Anzeige-Ebene über den unveränderten Spielregeln. Die Engine
// rechnet nur mit Karten- und Ressourcen-IDs — ein Theme tauscht Namen, Texte
// und Artwork. Anzeige-Präferenz je Gerät (wie die Sprache): Im Mehrgeräte-
// modus kann der Host klassisch spielen, während ein Gast die Mars-Kolonie
// sieht (oder das Drachenreich) — derselbe Spielzustand.

import type { Resource } from '../engine/types';

export type ThemeId = 'classic' | 'mars' | 'fantasy';

export const THEMES: { id: ThemeId }[] = [{ id: 'classic' }, { id: 'mars' }, { id: 'fantasy' }];

/** Alle Themes außer dem klassischen — diese brauchen Karten-Overrides. */
export const SKINNED_THEMES: Exclude<ThemeId, 'classic'>[] = ['mars', 'fantasy'];

const STORAGE_KEY = 'tinytowns.theme';

/** Gültige gespeicherte Wahl oder Standard (klassisch). */
export function pickTheme(stored: string | null): ThemeId {
  return THEMES.some((t) => t.id === stored) ? (stored as ThemeId) : 'classic';
}

function detect(): ThemeId {
  try {
    return pickTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'classic';
  }
}

export const theme: ThemeId = detect();

// data-theme steuert die CSS-Palette (index.html setzt es zusätzlich schon
// vor dem ersten Paint, damit nichts kurz klassisch aufblitzt)
if (typeof document !== 'undefined' && theme !== 'classic') {
  document.documentElement.dataset.theme = theme;
}

/** Theme wechseln: speichern und neu laden (Spielstand und Sitzung überleben
 *  den Reload — wie beim Sprachwechsel). */
export function setTheme(id: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // privater Modus — dann eben nur bis zum Reload
  }
  location.reload();
}

/** Mars: Ressourcen-Namen (gleiche Farben und IDs — Holz→Regolith usw.).
 *  Sprachen ohne eigene Übersetzung fallen auf Englisch zurück. */
export const THEME_RESOURCES: Partial<Record<ThemeId, Record<string, Record<Resource, string>>>> = {
  mars: {
    de: { wood: 'Regolith', brick: 'Eisen', stone: 'Titan', wheat: 'Nahrung', glass: 'Eis' },
    en: { wood: 'Regolith', brick: 'Iron', stone: 'Titanium', wheat: 'Food', glass: 'Ice' }
  },
  // Fantasy: Glas heißt bewusst NICHT „Mana-Kristall" — Mana ist die
  // Fortune-Währung (Münzen), das würde sich beißen.
  fantasy: {
    de: {
      wood: 'Elfenholz', brick: 'Drachenschuppe', stone: 'Runenstein',
      wheat: 'Mondkorn', glass: 'Feenglas'
    },
    en: {
      wood: 'Elfwood', brick: 'Dragonscale', stone: 'Runestone',
      wheat: 'Moongrain', glass: 'Faeglass'
    }
  }
};

/** Themen-Ressourcennamen für die aktive Sprache (null = klassisch lassen). */
export function themedResourceNames(lang: string): Record<Resource, string> | null {
  const perLang = THEME_RESOURCES[theme];
  if (!perLang) return null;
  return perLang[lang] ?? perLang.en ?? null;
}

/**
 * Mars: UI-Texte rund um Münzen (→ Energiezellen), Truhe (→ Akku) und
 * Tiny-Trees-Samen (→ Sporen/Flechten). Nur de+en — andere Sprachen fallen
 * wie bei den Kartentexten aufs Englische zurück. `sets` und `help` werden
 * schlüsselweise in die aktiven Texte gemischt.
 */
export const THEME_STRINGS: Partial<Record<ThemeId, Record<string, Record<string, unknown>>>> = {
  mars: {
    de: {
      terrain: { river: 'Canyon', mountain: 'Kraterfeld', lake: 'Eissee' },
      chooseBuildTarget: 'Wähle das Feld für das Modul',
      declareComplete: 'Kolonie fertigstellen',
      declareCompleteTitle: 'Kolonie fertigstellen?',
      declareCompleteText: 'Dein Kolonie hat keine freien Felder mehr. Wenn du fertigstellst, erhältst du keine Baumaterialien mehr und kannst nicht mehr bauen.',
      markResourceTitle: 'Material auf das Modul legen',
      groveTitle: 'Mars-Universität: Gratis-Modul wählen',
      guildTitle: 'Ingenieursgilde: Module ersetzen',
      guildPickBuilding: 'Tippe ein Modul, das ersetzt werden soll',
      guildPickNew: 'Neues Modul wählen',
      opaleyeSetupTitle: 'Opaleye-Radarwacht: Module bevorraten',
      opaleyeClaimTitle: 'Opaleye-Radarwacht: Modul erhalten?',
      townComplete: 'Kolonie fertig',
      scoreFed: 'versorgte Habitate',
      trainMode: 'Rohrbahn-Modus',
      trainModeHint: 'Eine Kapsel mit 3 Frachtpods gleitet Runde für Runde durch die Röhre — mit gebautem Rohrbahnhof darfst du Material verladen oder tauschen.',
      trainStopTitle: 'Die Kapsel hält an deinem Rohrbahnhof!',
      trainLoad: 'In einen Frachtpod verladen',
      trainSwapHint: 'Gegen den Inhalt dieses Pods tauschen',
      trainAt: (name: string) => `Die Kapsel hält bei ${name}`,
      trainPassing: (name: string) => `Die Kapsel hält bei ${name} (kein Rohrbahnhof)`,
      trainTunnel: 'Die Kapsel ist in der Schleuse',
      coins: 'Energiezellen',
      coinIcon: '🔋',
      coinSwap: 'Energiezelle: anderes Material',
      coinSwapHint: 'Zahle 1 Energiezelle und nimm ein beliebiges anderes Material',
      masonsTitle: 'Druckergilde: je 1 Energiezelle → 1 Modul',
      promenadeTitle: 'Kuppelpromenade: Energiezellen auf leere Felder legen',
      museumSell: 'Angesagtes Material zurückgeben (+1 Energiezelle)',
      cathedralTitle: 'Solardom: 3 Energiezellen zahlen?',
      cathedralPay: '3 Energiezellen zahlen',
      okaverTitle: 'Energiedepot: Akku voll → Gratis-Habitat?',
      oddityTakeTitle: 'Meteoritenladen: Material nehmen (+1 Energiezelle für dich)',
      seedPlaceHint: 'Tippe ein Feld für deine Spore',
      seedBonusTitle: 'Spore überbaut: Gratis-Material wählen',
      tree: 'Flechte',
      sets: {
        fortune: {
          name: 'Fortune',
          description: 'Energiezellen: 1 Zelle bei 2+ Bauten pro Runde; 1 Zelle zahlen, um ein anderes Material zu nehmen. 12 Module + 10 Monumente.'
        },
        tiny_trees: {
          name: 'Tiny Trees',
          description: 'Mini-Erweiterung: Jeder startet mit einer Spore. Überbauen bringt ein Gratis-Material; als letzter freier Platz wächst sie zur Flechte (2 Punkte).'
        }
      },
      help: {
        trainTitle: 'Rohrbahn-Modus (falls im Setup aktiviert)',
        trainSteps: [
          'Die Röhre verläuft an der unteren und oberen Kante des Spielfelds, mit Schleusen an den Enden. Die Kapsel (3 Frachtpods hinter dem Triebkopf) ist samt Ladung immer sichtbar.',
          'Am Ende jeder Runde gleitet sie eine Position weiter und hält an jeder Kolonie; ein Abschnitt führt durch die Schleuse — dadurch verschieben sich Kapsel und Baumeister gegeneinander (solo taucht sie alle 3 Runden auf).',
          'Der Rohrbahnhof liegt als 8. Karte für alle aus (Titan–Regolith–Titan, 2 Punkte, höchstens einer pro Kolonie) und muss an der Röhre gebaut werden — in der untersten Reihe deiner Kolonie.',
          'Nur mit Rohrbahnhof darfst du beim Halt statt zu platzieren: das erhaltene Material in einen freien Frachtpod verladen — oder gegen einen Pod-Inhalt tauschen (das getauschte platzierst du normal).',
          'Die Pods sind öffentlich: Was du abgibst, kann unterwegs jemand anderes wegschnappen.'
        ],
        fortuneTitle: 'Erweiterung: Fortune (Energiezellen)',
        fortuneSteps: [
          'Baust du in einer Runde 2 oder mehr Module (mit Materialentfernen), erhältst du 1 Energiezelle — der Akku fasst höchstens 4 (manche Monumente geben 1 Extra-Platz).',
          'Bei fremder Ansage kannst du 1 Energiezelle zahlen und stattdessen ein beliebiges anderes Material nehmen (🔋-Knopf am Material-Chip).',
          'Am Spielende ist jede Energiezelle im Akku 1 Punkt wert.',
          'Dazu kommen 12 Fortune-Module und 10 Monumente mit Energie-Effekten — alle nach den offiziellen Kartentexten umgesetzt.'
        ],
        treesTitle: 'Erweiterung: Tiny Trees (Sporen)',
        treesSteps: [
          'Jeder Spieler legt zu Beginn eine Spore auf ein freies Feld seines Bretts.',
          'Wird die Spore überbaut, wählst du ein Gratis-Material und platzierst es sofort.',
          'Bleibt die Spore bis zum Schluss als letztes unbebautes Feld liegen, wächst sie zur Flechte: 2 Punkte.'
        ]
      }
    },
    en: {
      terrain: { river: 'Canyon', mountain: 'Crater field', lake: 'Ice lake' },
      chooseBuildTarget: 'Choose the square for the module',
      declareComplete: 'Complete colony',
      declareCompleteTitle: 'Complete your colony?',
      declareCompleteText: 'Your colony has no empty squares left. Once completed, you no longer receive resources and cannot build.',
      markResourceTitle: 'Place a resource on the module',
      groveTitle: 'Mars University: choose a free module',
      guildTitle: "Engineers' Guild: replace modules",
      guildPickBuilding: 'Tap a module to replace',
      guildPickNew: 'Choose the new module',
      opaleyeSetupTitle: 'Opaleye Radar Watch: stock modules',
      opaleyeClaimTitle: 'Opaleye Radar Watch: receive a module?',
      townComplete: 'colony complete',
      scoreFed: 'supplied habitats',
      trainMode: 'Transit tube mode',
      trainModeHint: 'A capsule with 3 cargo pods glides through the tube round by round — with a built tube station you may load or swap resources.',
      trainStopTitle: 'The capsule is docking at your tube station!',
      trainLoad: 'Load into a cargo pod',
      trainSwapHint: "Swap for this pod's contents",
      trainAt: (name: string) => `The capsule stops at ${name}`,
      trainPassing: (name: string) => `The capsule stops at ${name} (no tube station)`,
      trainTunnel: 'The capsule is in the airlock',
      coins: 'Power cells',
      coinIcon: '🔋',
      coinSwap: 'Power cell: different resource',
      coinSwapHint: 'Pay 1 power cell and take any other resource',
      masonsTitle: "Printers' Guild: 1 power cell → 1 module",
      promenadeTitle: 'Dome Promenade: place power cells on empty squares',
      museumSell: 'Return the named resource (+1 power cell)',
      cathedralTitle: 'Solar Dome: pay 3 power cells?',
      cathedralPay: 'Pay 3 power cells',
      okaverTitle: 'Power Depot: battery full → free habitat?',
      oddityTakeTitle: 'Meteorite Shop: take a resource (+1 power cell for you)',
      seedPlaceHint: 'Tap a square for your spore',
      seedBonusTitle: 'Spore built over: choose a free resource',
      tree: 'Lichen',
      sets: {
        fortune: {
          name: 'Fortune',
          description: 'Power cells: 1 cell for 2+ builds per round; pay 1 cell to take a different resource. 12 modules + 10 monuments.'
        },
        tiny_trees: {
          name: 'Tiny Trees',
          description: 'Mini expansion: everyone starts with a spore. Building over it grants a free resource; as the last empty square it grows into a lichen (2 points).'
        }
      },
      help: {
        trainTitle: 'Transit tube mode (if enabled in setup)',
        trainSteps: [
          'The tube runs along the bottom and top edges of the play area, with airlocks at the ends. The capsule (3 cargo pods behind the drive head) is always visible with its load.',
          'At the end of every round it glides one position further and stops at every colony; one section runs through the airlock — so capsule and Master Builder shift against each other (solo it appears every 3rd round).',
          'The tube station is laid out as an 8th card for everyone (titanium–regolith–titanium, 2 points, at most one per colony) and must be built on the tube — in the bottom row of your colony.',
          'Only with a tube station may you, instead of placing: load the received resource into an empty cargo pod — or swap it for a pod\'s contents (then place the swapped resource normally).',
          'The pods are public: what you drop off, someone else may grab along the way.'
        ],
        fortuneTitle: 'Expansion: Fortune (power cells)',
        fortuneSteps: [
          'Construct 2 or more modules in a round (removing resources) to gain 1 power cell — the battery holds at most 4 (some monuments add 1 extra slot).',
          "On another player's naming you may pay 1 power cell and take any other resource instead (🔋 button on the resource chip).",
          'At game end every power cell in the battery is worth 1 point.',
          'Plus 12 Fortune modules and 10 monuments with power effects — all implemented from the official card texts.'
        ],
        treesTitle: 'Expansion: Tiny Trees (spores)',
        treesSteps: [
          'Each player starts by placing a spore on an empty square of their board.',
          'When the spore is built over, choose a free resource and place it immediately.',
          'If the spore remains as the last empty square, it grows into a lichen: 2 points.'
        ]
      }
    }
  }
  ,
  fantasy: {
    de: {
      terrain: { river: 'Nebelfluss', mountain: 'Drachenfels', lake: 'Zaubersee' },
      chooseBuildTarget: 'Wähle das Feld für das Bauwerk',
      declareComplete: 'Weiler fertigstellen',
      declareCompleteTitle: 'Weiler fertigstellen?',
      declareCompleteText: 'Dein Weiler hat keine freien Felder mehr. Wenn du fertigstellst, erhältst du keine Baumaterialien mehr und kannst nicht mehr bauen.',
      markResourceTitle: 'Material auf das Bauwerk legen',
      groveTitle: 'Magierakademie: Gratis-Bauwerk wählen',
      guildTitle: 'Baumeistergilde: Bauwerke ersetzen',
      guildPickBuilding: 'Tippe ein Bauwerk, das ersetzt werden soll',
      guildPickNew: 'Neues Bauwerk wählen',
      opaleyeSetupTitle: 'Opalauges Seherturm: Bauwerke bevorraten',
      opaleyeClaimTitle: 'Opalauges Seherturm: Bauwerk erhalten?',
      townComplete: 'Weiler fertig',
      scoreFed: 'verpflegte Katen',
      coins: 'Mana',
      coinIcon: '🔮',
      coinSwap: 'Mana: anderes Material',
      coinSwapHint: 'Zahle 1 Mana und nimm ein beliebiges anderes Material',
      masonsTitle: 'Runenmetzgilde: je 1 Mana → 1 Bauwerk',
      promenadeTitle: 'Blütenallee: Mana auf leere Felder legen',
      museumSell: 'Angesagtes Material zurückgeben (+1 Mana)',
      cathedralTitle: 'Hochdom: 3 Mana zahlen?',
      cathedralPay: '3 Mana zahlen',
      okaverTitle: 'Okavers Schatzkammer: Manaquell voll → Gratis-Kate?',
      oddityTakeTitle: 'Wunderkammer: Material nehmen (+1 Mana für dich)',
      seedPlaceHint: 'Tippe ein Feld für deine Feensaat',
      seedBonusTitle: 'Feensaat überbaut: Gratis-Material wählen',
      tree: 'Weltenbaum',
      sets: {
        fortune: {
          name: 'Fortune',
          description: 'Mana: 1 Mana bei 2+ Bauten pro Runde; 1 Mana zahlen, um ein anderes Material zu nehmen. 12 Bauwerke + 10 Monumente.'
        },
        tiny_trees: {
          name: 'Tiny Trees',
          description: 'Mini-Erweiterung: Jeder startet mit einer Feensaat. Überbauen bringt ein Gratis-Material; als letzter freier Platz wächst sie zum Weltenbaum (2 Punkte).'
        }
      },
      trainMode: 'Drachenflug-Modus',
      trainModeHint: 'Ein Drache mit 3 Traglasten zieht Runde für Runde über die Lande — mit gebautem Drachenhorst darfst du Material aufladen oder tauschen.',
      trainStopTitle: 'Der Drache landet auf deinem Horst!',
      trainLoad: 'Dem Drachen aufladen',
      trainSwapHint: 'Gegen diese Traglast tauschen',
      trainAt: (name: string) => `Der Drache landet bei ${name}`,
      trainPassing: (name: string) => `Der Drache landet bei ${name} (kein Horst)`,
      trainTunnel: 'Der Drache ist in den Wolken',
      help: {
        fortuneTitle: 'Erweiterung: Fortune (Mana)',
        fortuneSteps: [
          'Errichtest du in einer Runde 2 oder mehr Bauwerke (mit Materialentfernen), erhältst du 1 Mana — der Manaquell fasst höchstens 4 (manche Monumente geben 1 Extra-Platz).',
          'Bei fremder Ansage kannst du 1 Mana zahlen und stattdessen ein beliebiges anderes Material nehmen (🔮-Knopf am Material-Chip).',
          'Am Spielende ist jedes Mana im Manaquell 1 Punkt wert.',
          'Dazu kommen 12 Fortune-Bauwerke und 10 Monumente mit Mana-Effekten — alle nach den offiziellen Kartentexten umgesetzt.'
        ],
        treesTitle: 'Erweiterung: Tiny Trees (Feensaat)',
        treesSteps: [
          'Jeder Spieler legt zu Beginn eine Feensaat auf ein freies Feld seines Bretts.',
          'Wird die Feensaat überbaut, wählst du ein Gratis-Material und platzierst es sofort.',
          'Bleibt die Feensaat bis zum Schluss als letztes unbebautes Feld liegen, wächst sie zum Weltenbaum: 2 Punkte.'
        ],
        trainTitle: 'Drachenflug-Modus (falls im Setup aktiviert)',
        trainSteps: [
          'Die Flugroute verläuft an der unteren und oberen Kante des Spielfelds, mit Wolkenbänken an den Enden. Der Drache (3 Traglasten hinter dem Hals) ist samt Ladung immer sichtbar.',
          'Am Ende jeder Runde zieht er eine Position weiter und landet bei jedem Weiler; ein Abschnitt führt durch die Wolken — dadurch verschieben sich Drache und Baumeister gegeneinander (solo taucht er alle 3 Runden auf).',
          'Der Drachenhorst liegt als 8. Karte für alle aus (Runenstein–Elfenholz–Runenstein, 2 Punkte, höchstens einer pro Weiler) und muss an der Flugroute liegen — in der untersten Reihe deines Weilers.',
          'Nur mit Drachenhorst darfst du bei der Landung statt zu platzieren: das erhaltene Material in eine freie Traglast aufladen — oder gegen eine Traglast tauschen (das getauschte platzierst du normal).',
          'Die Traglasten sind öffentlich: Was du abgibst, kann unterwegs jemand anderes wegschnappen.'
        ]
      }
    },
    en: {
      terrain: { river: 'Mistflow', mountain: 'Dragonspire', lake: 'Spelllake' },
      chooseBuildTarget: 'Choose the square for the structure',
      declareComplete: 'Complete hamlet',
      declareCompleteTitle: 'Complete your hamlet?',
      declareCompleteText: 'Your hamlet has no empty squares left. Once completed, you no longer receive resources and cannot build.',
      markResourceTitle: 'Place a resource on the structure',
      groveTitle: 'Mage Academy: choose a free structure',
      guildTitle: "Master Builders' Guild: replace structures",
      guildPickBuilding: 'Tap a structure to replace',
      guildPickNew: 'Choose the new structure',
      opaleyeSetupTitle: "Opaleye's Seer Tower: stock structures",
      opaleyeClaimTitle: "Opaleye's Seer Tower: receive a structure?",
      townComplete: 'hamlet complete',
      scoreFed: 'provisioned crofts',
      coins: 'Mana',
      coinIcon: '🔮',
      coinSwap: 'Mana: different resource',
      coinSwapHint: 'Pay 1 mana and take any other resource',
      masonsTitle: "Runemasons' Guild: 1 mana → 1 structure",
      promenadeTitle: 'Petal Avenue: place mana on empty squares',
      museumSell: 'Return the named resource (+1 mana)',
      cathedralTitle: 'High Dome: pay 3 mana?',
      cathedralPay: 'Pay 3 mana',
      okaverTitle: 'Treasury at Okaver: mana well full → free croft?',
      oddityTakeTitle: 'Cabinet of Wonders: take a resource (+1 mana for you)',
      seedPlaceHint: 'Tap a square for your faeseed',
      seedBonusTitle: 'Faeseed built over: choose a free resource',
      tree: 'World Tree',
      sets: {
        fortune: {
          name: 'Fortune',
          description: 'Mana: 1 mana for 2+ raisings per round; pay 1 mana to take a different resource. 12 structures + 10 monuments.'
        },
        tiny_trees: {
          name: 'Tiny Trees',
          description: 'Mini expansion: everyone starts with a faeseed. Building over it grants a free resource; as the last empty square it grows into a World Tree (2 points).'
        }
      },
      trainMode: 'Dragon flight mode',
      trainModeHint: 'A dragon with 3 slings crosses the lands round by round — with a built dragon eyrie you may load or swap resources.',
      trainStopTitle: 'The dragon is landing on your eyrie!',
      trainLoad: 'Load onto the dragon',
      trainSwapHint: 'Swap for this sling',
      trainAt: (name: string) => `The dragon lands at ${name}`,
      trainPassing: (name: string) => `The dragon lands at ${name} (no eyrie)`,
      trainTunnel: 'The dragon is in the clouds',
      help: {
        fortuneTitle: 'Expansion: Fortune (mana)',
        fortuneSteps: [
          'Raise 2 or more structures in a round (removing resources) to gain 1 mana — the mana well holds at most 4 (some monuments add 1 extra slot).',
          "On another player's naming you may pay 1 mana and take any other resource instead (🔮 button on the resource chip).",
          'At game end every mana in the well is worth 1 point.',
          'Plus 12 Fortune structures and 10 monuments with mana effects — all implemented from the official card texts.'
        ],
        treesTitle: 'Expansion: Tiny Trees (faeseed)',
        treesSteps: [
          'Each player starts by placing a faeseed on an empty square of their board.',
          'When the faeseed is built over, choose a free resource and place it immediately.',
          'If the faeseed remains as the last empty square, it grows into a World Tree: 2 points.'
        ],
        trainTitle: 'Dragon flight mode (if enabled in setup)',
        trainSteps: [
          'The flight path runs along the bottom and top edges of the play area, with cloud banks at the ends. The dragon (3 slings behind its neck) is always visible with its load.',
          'At the end of every round it moves one position further and lands at every hamlet; one section passes through the clouds — so dragon and Master Builder shift against each other (solo it appears every 3rd round).',
          'The dragon eyrie is laid out as an 8th card for everyone (runestone-elfwood-runestone, 2 points, at most one per hamlet) and must lie on the flight path — in the bottom row of your hamlet.',
          'Only with a dragon eyrie may you, on landing, instead of placing: load the received resource into an empty sling — or swap it for a sling (then place the swapped resource normally).',
          'The slings are public: what you drop off, someone else may grab along the way.'
        ]
      }
    }
  }
};

/** Themen-UI-Texte für die aktive Sprache (null = klassisch lassen). */
export function themedStrings(lang: string): Record<string, unknown> | null {
  const perLang = THEME_STRINGS[theme];
  if (!perLang) return null;
  return perLang[lang] ?? perLang.en ?? null;
}
