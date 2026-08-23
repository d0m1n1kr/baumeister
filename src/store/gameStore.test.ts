// Reset-Verhalten des Stores: Ein Gast darf mit „Neue Partie" nicht den
// eigenen (unabhängigen) Ein-Gerät-Spielstand dieses Geräts löschen.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { game } from './gameStore.svelte';
import { config } from '../engine/test-helpers';

const data = new Map<string, string>();

describe('gameStore.reset', () => {
  beforeEach(() => {
    data.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k)
    });
    game.reset({ keepSave: true }); // Singleton zwischen Tests neutralisieren
  });
  afterEach(() => vi.unstubAllGlobals());

  it('löscht den Spielstand im Ein-Gerät-Modus', () => {
    game.start(config(2));
    expect(game.hasSave()).toBe(true);
    game.reset();
    expect(game.state).toBeNull();
    expect(game.hasSave()).toBe(false);
  });

  it('verschont den Spielstand mit keepSave (Gast am Partieende)', () => {
    game.start(config(2)); // eigener Spielstand auf diesem Gerät
    game.reset({ keepSave: true });
    expect(game.state).toBeNull();
    expect(game.hasSave()).toBe(true); // der eigene Spielstand lebt noch
  });
});
