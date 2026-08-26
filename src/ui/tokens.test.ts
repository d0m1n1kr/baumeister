// Maßstäbe halten nur, wenn niemand daneben schreibt.
//
// Der Test liest die Stylesheets und schlägt an, sobald eine Schriftgröße oder
// ein Eckenradius als Rohwert statt als Token auftaucht. Ohne ihn stehen in
// drei Monaten wieder 18 Schriftgrößen und 15 Radien im Code — genau der
// Zustand, den das Designreview aufgedeckt hat.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Begründete Ausnahmen. Jede steht hier mit ihrem Grund, damit „ist eben
 * klein" nicht als Argument durchgeht.
 */
const AUSNAHMEN = [
  // Die Marken-Beschriftung schrumpft, damit lange Materialnamen (Themen,
  // andere Sprachen) auf die Marke passen. Das ist ein Anpassungsmechanismus
  // in drei Stufen, kein Schriftmaßstab.
  '.resLabel.long',
  '.resLabel.xlong'
];

function dateien(): { pfad: string; text: string }[] {
  const aus: { pfad: string; text: string }[] = [];
  aus.push({ pfad: 'src/app.css', text: readFileSync('src/app.css', 'utf8') });
  for (const name of readdirSync('src/ui')) {
    if (name.endsWith('.svelte')) {
      aus.push({ pfad: `src/ui/${name}`, text: readFileSync(`src/ui/${name}`, 'utf8') });
    }
  }
  return aus;
}

/** Zeilen mit Rohwert, ohne die begründeten Ausnahmen. */
function verstoesse(eigenschaft: string): string[] {
  const muster = new RegExp(`${eigenschaft}:\\s*[0-9.]+px`);
  const treffer: string[] = [];
  for (const { pfad, text } of dateien()) {
    text.split('\n').forEach((zeile, i) => {
      if (!muster.test(zeile)) return;
      if (AUSNAHMEN.some((a) => zeile.includes(a))) return;
      treffer.push(`${pfad}:${i + 1} ${zeile.trim()}`);
    });
  }
  return treffer;
}

describe('Maßstäbe', () => {
  it('setzt Schriftgrößen nur über Tokens', () => {
    expect(verstoesse('font-size')).toEqual([]);
  });

  it('setzt Eckenradien nur über Tokens', () => {
    expect(verstoesse('border-radius')).toEqual([]);
  });

  it('kennt genau sechs Schriftstufen und vier Radien', () => {
    const css = readFileSync('src/app.css', 'utf8');
    const stufen = [...css.matchAll(/^\s*--fs-[a-z0-9]+:/gm)].length;
    const radien = [...css.matchAll(/^\s*--r-[a-z]+:/gm)].length;
    expect({ stufen, radien }).toEqual({ stufen: 6, radien: 4 });
  });

  it('lässt jede Ausnahme mit Begründung im Test stehen', () => {
    // Die Ausnahmen müssen im Code auch wirklich existieren — sonst sammelt
    // sich hier eine Liste toter Freibriefe an.
    const alles = dateien()
      .map((d) => d.text)
      .join('\n');
    for (const a of AUSNAHMEN) expect(alles).toContain(a);
  });
});
