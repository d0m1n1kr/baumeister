// Soundeffekte, komplett per Web Audio synthetisiert: warme Marimba-, Holz-
// und Glockenklänge zum Waldstädtchen-Thema. Keine Asset-Dateien, keine
// Lizenzfragen, voll offline — und unter iOS erst nach der ersten Berührung
// hörbar (der AudioContext entsteht lazy im ersten play()-Aufruf, der bei
// uns immer aus einer Nutzer-Geste kommt).

import type { Resource } from '../engine/types';
import { theme } from '../theme';

const SOUND_KEY = 'tinytowns.sound';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.22; // dezent — Brettspiel, kein Arcade-Automat
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // kein Web Audio (Tests, alte Browser) — still bleiben
  }
}

/** Ein Ton mit perkussivem Ausklang (Marimba-artig). */
function tone(
  at: number,
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  vol = 1
): void {
  const ac = ctx!;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + at;
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master!);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Materialklänge: jedes Material hat seine eigene Tonhöhe (Holz tief, Glas hell). */
const RESOURCE_PITCH: Record<Resource, number> = {
  wood: 220,
  stone: 196,
  brick: 262,
  wheat: 330,
  glass: 440
};

const EFFECTS = {
  /** Baumeister hat Material angesagt. */
  named(): void {
    tone(0, 523, 0.14, 'triangle', 0.8);
    tone(0.07, 784, 0.16, 'triangle', 0.6);
  },
  /** Dieses Gerät ist mit dem Ansagen dran. */
  myTurn(): void {
    tone(0, 659, 0.12, 'triangle', 0.7);
    tone(0.12, 880, 0.18, 'triangle', 0.7);
  },
  /** Material aufs Brett gelegt — Holz-Klack in Material-Tonhöhe. */
  place(resource?: Resource): void {
    tone(0, resource ? RESOURCE_PITCH[resource] : 262, 0.08, 'triangle', 0.9);
    tone(0, 1200, 0.02, 'square', 0.12); // der „Klack"
  },
  /** Gebäude gebaut: zwei Hammerschläge + freundlicher Zweiklang. */
  build(): void {
    tone(0, 150, 0.05, 'triangle', 0.9);
    tone(0.09, 165, 0.05, 'triangle', 0.9);
    tone(0.2, 523, 0.18, 'triangle', 0.5);
    tone(0.2, 659, 0.18, 'triangle', 0.5);
  },
  /** Monument vollendet: kleine Glocke. */
  monument(): void {
    for (const [i, f] of [660, 990, 1320].entries()) tone(i * 0.09, f, 0.7, 'sine', 0.45);
  },
  /** Fortune: Münze erhalten. */
  coin(): void {
    tone(0, 1568, 0.06, 'square', 0.15);
    tone(0.06, 2093, 0.1, 'square', 0.12);
  },
  /** Tiny Trees: Samen überbaut. */
  tree(): void {
    tone(0, 587, 0.3, 'sine', 0.5);
    tone(0.1, 880, 0.35, 'sine', 0.35);
  },
  /** Abgelehnter Zug: gedämpftes Tock. */
  error(): void {
    tone(0, 110, 0.12, 'triangle', 0.8);
  },
  /** Spielende: kleine warme Fanfare. */
  gameOver(): void {
    for (const [i, f] of [523, 659, 784, 1047].entries()) tone(i * 0.1, f, 0.25, 'triangle', 0.55);
  },
  /** Eisenbahn: Fahrgeräusch — klassisch Schnaufen, auf dem Mars ein
   *  gleitendes Rohr-Whoosh (~2,5 s). */
  trainMove(): void {
    if (theme === 'mars') {
      tone(0, 65, 2.2, 'sine', 0.3); // tiefes Rohr-Brummen
      for (let i = 0; i < 8; i++) {
        tone(i * 0.28, 1250 - i * 95, 0.22, 'sine', 0.08); // gleitendes Zischen
      }
      return;
    }
    for (let i = 0; i < 14; i++) {
      const t = i * 0.17;
      tone(t, 90 + (i % 2) * 14, 0.07, 'triangle', 0.5); // Tsch…
      tone(t + 0.02, 800, 0.03, 'square', 0.05);         // …ff (Dampf)
    }
  },
  /** Eisenbahn: Einfahrt in den Bahnhof — klassisch Horn, auf dem Mars ein
   *  Docking-Signal mit Verriegelungs-Klack. */
  trainHorn(): void {
    if (theme === 'mars') {
      tone(0, 880, 0.14, 'sine', 0.3);
      tone(0.2, 660, 0.22, 'sine', 0.3);
      tone(0.55, 120, 0.09, 'triangle', 0.7); // Klack der Verriegelung
      return;
    }
    tone(0, 233, 0.9, 'sawtooth', 0.18);
    tone(0, 311, 0.9, 'sawtooth', 0.16);
    tone(0, 466, 0.9, 'sine', 0.2);
  }
};

export type SoundName = keyof typeof EFFECTS;

let enabled = readEnabled();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0'; // Standard: an
  } catch {
    return true;
  }
}

export const sfx = {
  get enabled(): boolean {
    return enabled;
  },

  toggle(): boolean {
    enabled = !enabled;
    try {
      localStorage.setItem(SOUND_KEY, enabled ? '1' : '0');
    } catch {
      // privater Modus — gilt dann nur für diese Sitzung
    }
    if (enabled) this.play('place');
    return enabled;
  },

  play(name: SoundName, resource?: Resource): void {
    if (!enabled) return;
    if (!audio()) return;
    try {
      if (name === 'place') EFFECTS.place(resource);
      else EFFECTS[name]();
    } catch {
      // Audio darf niemals das Spiel stören
    }
  }
};
