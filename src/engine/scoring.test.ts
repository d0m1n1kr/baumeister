import { describe, it, expect } from 'vitest';
import { scorePlayer } from './scoring';
import { catalog, freshGame, put, ACTIVE_DEFAULT } from './test-helpers';
import { idx } from './types';
import type { GameState } from './types';

function line(s: GameState, player: number, card: string): number {
  const score = scorePlayer(s, player, catalog);
  return score.lines.find((l) => l.card === card)?.points ?? 0;
}

describe('Fütterung', () => {
  it('Bauernhof füttert bis zu 4 Hütten irgendwo', () => {
    const s = freshGame();
    put(s, 0, 0, 'cottage');
    put(s, 0, 1, 'cottage');
    put(s, 0, 15, 'farm');
    expect(line(s, 0, 'cottage')).toBe(6);

    for (const sq of [2, 3, 4]) put(s, 0, sq, 'cottage');
    // 5 Hütten, Kapazität 4 → 12 Punkte
    expect(line(s, 0, 'cottage')).toBe(12);
  });

  it('Kornspeicher füttert nur die 8 umliegenden Felder', () => {
    const s = freshGame();
    put(s, 0, idx(1, 1), 'granary');
    put(s, 0, idx(0, 0), 'cottage'); // diagonal angrenzend → gefüttert
    put(s, 0, idx(3, 3), 'cottage'); // weit weg → ungefüttert
    expect(line(s, 0, 'cottage')).toBe(3);
  });

  it('Obstgarten füttert Zeile und Spalte', () => {
    const s = freshGame();
    put(s, 0, idx(1, 1), 'orchard');
    put(s, 0, idx(1, 3), 'cottage'); // gleiche Zeile → gefüttert
    put(s, 0, idx(3, 3), 'cottage'); // weder Zeile noch Spalte
    expect(line(s, 0, 'cottage')).toBe(3);
  });

  it('Gewächshaus wählt die beste zusammenhängende Gruppe', () => {
    const s = freshGame();
    put(s, 0, 0, 'cottage');
    put(s, 0, 1, 'cottage'); // Gruppe A: 2 Hütten
    put(s, 0, 15, 'cottage'); // Gruppe B: 1 Hütte
    put(s, 0, 12, 'greenhouse');
    expect(line(s, 0, 'cottage')).toBe(6);
  });

  it('Bauernhof-Optimierung bevorzugt Tempel-Nachbarn', () => {
    const s = freshGame(2, ['cottage', 'farm', 'well', 'temple', 'theater', 'tavern', 'factory']);
    put(s, 0, idx(1, 1), 'temple');
    put(s, 0, idx(0, 1), 'cottage'); // an Tempel
    put(s, 0, idx(2, 1), 'cottage'); // an Tempel
    put(s, 0, idx(0, 3), 'cottage');
    put(s, 0, idx(1, 3), 'cottage');
    put(s, 0, idx(3, 3), 'cottage'); // 5 Hütten, Kapazität 4
    put(s, 0, idx(3, 0), 'farm');
    expect(line(s, 0, 'temple')).toBe(4);
    expect(line(s, 0, 'cottage')).toBe(12);
  });
});

describe('Gebäude-Wertungen', () => {
  it('Brunnen: 1 je angrenzende Hütte', () => {
    const s = freshGame();
    put(s, 0, idx(1, 1), 'well');
    put(s, 0, idx(0, 1), 'cottage');
    put(s, 0, idx(2, 1), 'cottage');
    put(s, 0, idx(3, 3), 'cottage');
    expect(line(s, 0, 'well')).toBe(2);
  });

  it('Springbrunnen: 2 bei grauem Nachbarn', () => {
    const s = freshGame(2, ['cottage', 'farm', 'fountain', 'chapel', 'theater', 'tavern', 'factory']);
    put(s, 0, 0, 'fountain');
    put(s, 0, 1, 'fountain');
    expect(line(s, 0, 'fountain')).toBe(4);
    const s2 = freshGame();
    put(s2, 0, 0, 'fountain');
    expect(line(s2, 0, 'fountain')).toBe(0);
  });

  it('Mühlstein: 2 bei rotem oder gelbem Nachbarn', () => {
    const s = freshGame();
    put(s, 0, 0, 'millstone');
    put(s, 0, 1, 'farm');
    put(s, 0, 15, 'millstone');
    expect(line(s, 0, 'millstone')).toBe(2);
  });

  it('Kapelle: 1 je gefütterte Hütte, Schloss Barrett zählt doppelt', () => {
    const s = freshGame();
    put(s, 0, 1, 'cottage');
    put(s, 0, 2, 'cottage');
    put(s, 0, 10, 'barrett_castle');
    put(s, 0, 15, 'farm'); // füttert alle 3 (Kapazität 4)
    put(s, 0, 12, 'chapel');
    expect(line(s, 0, 'chapel')).toBe(4);
    expect(line(s, 0, 'barrett_castle')).toBe(5);
  });

  it('Abtei: 3 ohne schwarzen/grünen/gelben Nachbarn', () => {
    const s = freshGame();
    put(s, 0, 0, 'abbey');
    expect(line(s, 0, 'abbey')).toBe(3);
    put(s, 0, 1, 'tavern');
    expect(line(s, 0, 'abbey')).toBe(0);
  });

  it('Kloster: 1 je oranges Gebäude in einer Ecke', () => {
    const s = freshGame(2, ['cottage', 'farm', 'well', 'cloister', 'theater', 'tavern', 'factory']);
    put(s, 0, 0, 'cloister');
    put(s, 0, 3, 'cloister');
    put(s, 0, 5, 'cloister'); // keine Ecke, wertet aber selbst
    expect(line(s, 0, 'cloister')).toBe(6);
  });

  it('Tempel: 4 bei mindestens 2 angrenzenden gefütterten Hütten', () => {
    const s = freshGame();
    put(s, 0, idx(1, 1), 'temple');
    put(s, 0, idx(0, 1), 'cottage');
    put(s, 0, idx(2, 1), 'cottage');
    expect(line(s, 0, 'temple')).toBe(0); // ungefüttert
    put(s, 0, idx(3, 3), 'farm');
    expect(line(s, 0, 'temple')).toBe(4);
  });

  it('Theater: 1 je anderem Gebäudetyp in Zeile und Spalte', () => {
    const s = freshGame();
    put(s, 0, idx(1, 1), 'theater');
    put(s, 0, idx(1, 0), 'well');
    put(s, 0, idx(0, 1), 'cottage');
    put(s, 0, idx(3, 1), 'tavern');
    put(s, 0, idx(1, 2), 'theater'); // eigener Typ zählt nicht
    // Theater 1: well+cottage+tavern = 3; Theater 2: well = 1
    expect(line(s, 0, 'theater')).toBe(4);
  });

  it('Markt: Zeile ∪ Spalte, selbst einmal mitgezählt', () => {
    const s = freshGame(2, ['cottage', 'farm', 'well', 'chapel', 'market', 'tavern', 'factory']);
    put(s, 0, idx(1, 1), 'market');
    put(s, 0, idx(1, 3), 'market');
    put(s, 0, idx(3, 1), 'market');
    // m(1,1): 1+1+1=3, m(1,3): 1+1=2, m(3,1): 1+1=2
    expect(line(s, 0, 'market')).toBe(7);
  });

  it('Schneiderei: 1 + 1 je gelbes Gebäude im Zentrum', () => {
    const s = freshGame();
    put(s, 0, 5, 'tailor');   // Zentrum, zählt selbst
    put(s, 0, 6, 'theater');  // Zentrum, gelb
    put(s, 0, 0, 'tailor');   // keine Zentrale
    // tailor@5: 1 + 3 = 4 (tailor@5, theater@6, +? tailor@0 nicht im Zentrum → 2) → 1+2=3
    // tailor@0: 1 + 2 = 3
    expect(line(s, 0, 'tailor')).toBe(6);
  });

  it('Taverne: Punktetabelle', () => {
    const s = freshGame();
    put(s, 0, 0, 'tavern');
    expect(line(s, 0, 'tavern')).toBe(2);
    put(s, 0, 1, 'tavern');
    put(s, 0, 2, 'tavern');
    expect(line(s, 0, 'tavern')).toBe(9);
    put(s, 0, 3, 'tavern');
    put(s, 0, 4, 'tavern');
    expect(line(s, 0, 'tavern')).toBe(20); // 5+ → 20
  });

  it('Gasthaus: 3 wenn allein in Zeile und Spalte', () => {
    const s = freshGame(2, ['cottage', 'farm', 'well', 'chapel', 'theater', 'inn', 'factory']);
    put(s, 0, idx(0, 0), 'inn');
    put(s, 0, idx(1, 1), 'inn');
    expect(line(s, 0, 'inn')).toBe(6);
    put(s, 0, idx(0, 3), 'inn'); // gleiche Zeile wie (0,0)
    expect(line(s, 0, 'inn')).toBe(3); // nur (1,1) allein
  });

  it('Armenhaus: Tabelle mit Minuspunkten', () => {
    const s = freshGame();
    put(s, 0, 0, 'almshouse');
    expect(line(s, 0, 'almshouse')).toBe(-1);
    put(s, 0, 1, 'almshouse');
    expect(line(s, 0, 'almshouse')).toBe(5);
  });

  it('Festhalle: 3 statt 2, wenn mehr als der rechte Nachbar', () => {
    const s = freshGame();
    put(s, 0, 0, 'feast_hall');
    put(s, 0, 1, 'feast_hall');
    put(s, 1, 0, 'feast_hall');
    expect(line(s, 0, 'feast_hall')).toBe(6); // 2 > 1 → 2×3
    expect(line(s, 1, 'feast_hall')).toBe(2); // 1 < 2 → 1×2
  });

  it('Bank 4, Handelsposten 1, Fabrik 0', () => {
    const s = freshGame();
    put(s, 0, 0, 'bank');
    put(s, 0, 1, 'trading_post');
    put(s, 0, 2, 'factory');
    expect(line(s, 0, 'bank')).toBe(4);
    expect(line(s, 0, 'trading_post')).toBe(1);
    expect(line(s, 0, 'factory')).toBe(0);
  });

  it('Lagerhaus: −1 je eingelagertem Material', () => {
    const s = freshGame();
    put(s, 0, 0, 'warehouse', { stored: ['wood', 'glass'] });
    expect(line(s, 0, 'warehouse')).toBe(-2);
  });
});

describe('Leere Felder & Monument-Modifikatoren', () => {
  it('−1 je leerem Feld; Restmaterial zählt als leer', () => {
    const s = freshGame();
    put(s, 0, 0, 'well');
    s.players[0].board[1].resource = 'wood';
    const score = scorePlayer(s, 0, catalog);
    expect(score.emptySquares).toBe(15);
    expect(score.emptyPenalty).toBe(-15);
  });

  it('Kathedrale: leere Felder kosten nichts', () => {
    const s = freshGame();
    put(s, 0, 0, 'cathedral_of_caterina');
    const score = scorePlayer(s, 0, catalog);
    expect(score.emptyPenalty).toBe(0);
    expect(line(s, 0, 'cathedral_of_caterina')).toBe(2);
  });

  it('Mausoleum: ungefütterte Hütten zählen 3', () => {
    const s = freshGame();
    put(s, 0, 0, 'cottage');
    put(s, 0, 1, 'cottage');
    put(s, 0, 15, 'grand_mausoleum_of_the_rodina');
    expect(line(s, 0, 'cottage')).toBe(6);
    // aber nicht „gefüttert" für die Kapelle
    put(s, 0, 12, 'chapel');
    expect(line(s, 0, 'chapel')).toBe(0);
  });

  it('Archiv: 1 je einzigartigem Typ ohne Monumente', () => {
    const s = freshGame();
    put(s, 0, 0, 'cottage');
    put(s, 0, 1, 'cottage');
    put(s, 0, 2, 'well');
    put(s, 0, 3, 'farm');
    put(s, 0, 15, 'archive_of_the_second_age');
    expect(line(s, 0, 'archive_of_the_second_age')).toBe(3);
  });

  it('Mandras-Palast: 2 je einzigartigem Nachbartyp', () => {
    const s = freshGame();
    put(s, 0, idx(1, 1), 'mandras_palace');
    put(s, 0, idx(0, 1), 'cottage');
    put(s, 0, idx(1, 0), 'cottage');
    put(s, 0, idx(1, 2), 'well');
    expect(line(s, 0, 'mandras_palace')).toBe(4);
  });

  it('Himmelsbäder: 2 je fehlendem Gebäudetyp', () => {
    const s = freshGame();
    put(s, 0, 0, 'cottage');
    put(s, 0, 1, 'well');
    put(s, 0, 15, 'the_sky_baths');
    // aktive Karten: 7, gebaut: cottage+well → 5 fehlen
    expect(line(s, 0, 'the_sky_baths')).toBe(10);
  });

  it('Silva-Forum: 1 + größte zusammenhängende Gruppe', () => {
    const s = freshGame();
    put(s, 0, 0, 'cottage');
    put(s, 0, 1, 'cottage');
    put(s, 0, 2, 'cottage');
    put(s, 0, 8, 'well');
    put(s, 0, 15, 'silva_forum');
    expect(line(s, 0, 'silva_forum')).toBe(4);
  });

  it('Schrein: Punkte nach Gebäudezahl beim Bau', () => {
    const s = freshGame();
    put(s, 0, 0, 'shrine_of_the_elder_tree');
    s.players[0].shrineSnapshot = 3;
    expect(line(s, 0, 'shrine_of_the_elder_tree')).toBe(3);
    s.players[0].shrineSnapshot = 6;
    expect(line(s, 0, 'shrine_of_the_elder_tree')).toBe(8);
  });

  it('Sternenwebstuhl: Punkte nach Fertigstellungs-Rang', () => {
    const s = freshGame(3);
    put(s, 0, 0, 'the_starloom');
    put(s, 1, 0, 'the_starloom');
    s.players[0].finishRound = 8;
    s.players[1].finishRound = 5;
    s.players[2].finishRound = 8;
    expect(line(s, 1, 'the_starloom')).toBe(6); // Rang 1
    expect(line(s, 0, 'the_starloom')).toBe(3); // Rang 2 (geteilt)
  });
});
