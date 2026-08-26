import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { FEATURE_KEY } from '../ui/helpers';
import { LANGUAGES, TRANSLATIONS, pickLanguage } from './index';
import { de } from './de';

/** Alle Schlüsselpfade eines Übersetzungsobjekts (rekursiv, ohne errors-Inhalte). */
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (path === 'errors' || path === 'sets' || path === 'resourceNames') {
      out.push(path); // Inhalte sind Records — nur die Existenz zählt
    } else if (v && typeof v === 'object' && !Array.isArray(v) && typeof v !== 'function') {
      out.push(...keyPaths(v as Record<string, unknown>, path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}

describe('i18n: Vollständigkeit', () => {
  const reference = keyPaths(de as unknown as Record<string, unknown>);

  it('alle Sprachen haben exakt die Schlüssel der Referenz (Deutsch)', () => {
    for (const { code } of LANGUAGES) {
      const paths = keyPaths(TRANSLATIONS[code] as unknown as Record<string, unknown>);
      expect(paths, `Sprache ${code}`).toEqual(reference);
    }
  });

  it('resourceNames und sets sind überall vollständig', () => {
    for (const { code } of LANGUAGES) {
      const tr = TRANSLATIONS[code];
      for (const r of ['wood', 'brick', 'stone', 'wheat', 'glass']) {
        expect(tr.resourceNames[r], `${code}: resourceNames.${r}`).toBeTruthy();
      }
      for (const s of ['base', 'fortune', 'tiny_trees']) {
        expect(tr.sets[s]?.name, `${code}: sets.${s}`).toBeTruthy();
      }
      expect(tr.soloRanks).toHaveLength(6);
      expect(tr.cornerNames).toHaveLength(4);
    }
  });

  it('jede Engine-Fehlermeldung ist in allen Nicht-Referenz-Sprachen übersetzt', () => {
    const src =
      readFileSync('src/engine/game.ts', 'utf8') +
      readFileSync('src/engine/registry.ts', 'utf8') +
      readFileSync('src/net/seats.ts', 'utf8');
    const messages = new Set<string>();
    for (const m of src.matchAll(/fail\('([^']+)'\)/g)) messages.add(m[1]);
    for (const m of src.matchAll(/: '([^']+)';\s*$/gm)) {
      // seats.ts: `return ... : 'Meldung';`
      if (/[a-zäöü]/i.test(m[1]) && m[1].length > 10) messages.add(m[1]);
    }
    expect(messages.size).toBeGreaterThan(80);
    for (const { code } of LANGUAGES) {
      if (code === 'de') continue; // Referenz: Original bleibt stehen
      const errors = TRANSLATIONS[code].errors;
      const missing = [...messages].filter((msg) => !errors[msg]);
      expect(missing, `Sprache ${code}: fehlende Fehlertexte`).toEqual([]);
    }
  });

  it('Netz-Meldungen der Session sind übersetzt', () => {
    const NET = [
      'Verbindung fehlgeschlagen.',
      'Verbindungsaufbau abgebrochen.',
      'Kein Host unter diesem Code erreichbar — Host-Gerät wecken und erneut versuchen.',
      'Dein Platz wurde am Host-Gerät übernommen.',
      'Kein freier Platz in dieser Partie.',
      'Unterschiedliche App-Version — bitte aktualisieren.'
    ];
    for (const { code } of LANGUAGES) {
      if (code === 'de') continue;
      for (const msg of NET) {
        expect(TRANSLATIONS[code].errors[msg], `${code}: ${msg}`).toBeTruthy();
      }
    }
  });
});

describe('i18n: Sprachwahl', () => {
  it('gespeicherte gültige Wahl gewinnt', () => {
    expect(pickLanguage('fr', ['de-DE'])).toBe('fr');
  });
  it('ungültige gespeicherte Wahl fällt auf Browser-Sprachen zurück', () => {
    expect(pickLanguage('xx', ['pt-BR', 'en-US'])).toBe('pt');
    expect(pickLanguage(null, ['it-IT'])).toBe('it');
    expect(pickLanguage(null, ['zh-CN', 'nl'])).toBe('nl');
  });
  it('ohne Treffer: Englisch', () => {
    expect(pickLanguage(null, ['zh-CN', 'ja'])).toBe('en');
    expect(pickLanguage(null, [])).toBe('en');
  });
});

describe('i18n: keine festen Texte in der Oberfläche', () => {
  // Die Erklärungen der Effektzeichen standen hart auf Deutsch in helpers.ts —
  // sieben von acht Sprachen zeigten deutschen Text. Sichtbare Beschriftungen
  // und Tooltips müssen deshalb immer aus einem Ausdruck kommen, nie als
  // Literal im Markup stehen.
  it('setzt title und aria-label nur aus Ausdrücken', () => {
    const treffer: string[] = [];
    for (const name of readdirSync('src/ui')) {
      if (!name.endsWith('.svelte')) continue;
      const text = readFileSync(`src/ui/${name}`, 'utf8');
      text.split('\n').forEach((zeile, i) => {
        const m = /\b(?:title|aria-label)="([^"{][^"]*)"/.exec(zeile);
        if (m) treffer.push(`src/ui/${name}:${i + 1} ${m[1]}`);
      });
    }
    expect(treffer).toEqual([]);
  });

  it('erklärt jedes Effektzeichen in jeder Sprache', () => {
    const schluessel = Object.values(FEATURE_KEY);
    expect(schluessel.length).toBeGreaterThan(0);
    for (const code of Object.keys(TRANSLATIONS) as (keyof typeof TRANSLATIONS)[]) {
      for (const k of schluessel) {
        expect(TRANSLATIONS[code].features[k], `${code}: ${k}`).toBeTruthy();
      }
    }
  });
});
