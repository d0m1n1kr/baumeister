// Der echte Store (nicht das Test-Double der Session-Tests): Aktions-Routing
// über die netBridge, Persistenz und das Reset-Verhalten. Ein Gast darf mit
// „Neue Partie" nicht den eigenen Ein-Gerät-Spielstand dieses Geräts löschen.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { game, netBridge } from './gameStore.svelte';
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
  afterEach(() => {
    vi.unstubAllGlobals();
    netBridge.sendAction = null;
    netBridge.onLocalApplied = null;
  });

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

describe('gameStore: Routing und Persistenz', () => {
  const data = new Map<string, string>();

  beforeEach(() => {
    data.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k)
    });
    game.reset({ keepSave: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    netBridge.sendAction = null;
    netBridge.onLocalApplied = null;
  });

  it('wendet Aktionen lokal an, speichert und meldet onLocalApplied (Host-Pfad)', () => {
    game.start(config(2));
    let broadcasts = 0;
    netBridge.onLocalApplied = () => broadcasts++;

    expect(game.dispatch({ t: 'nameResource', resource: 'wood' })).toBeNull();
    expect(game.state!.phase).toEqual({ t: 'round', resource: 'wood' });
    expect(broadcasts).toBe(1);
    expect(game.hasSave()).toBe(true);

    // Regelverstoß: Meldung statt Exception, kein Broadcast
    const err = game.dispatch({ t: 'nameResource', resource: 'wood' });
    expect(err).not.toBeNull();
    expect(broadcasts).toBe(1);
  });

  it('leitet Aktionen als Gast um, statt sie anzuwenden', () => {
    game.start(config(2));
    const sent: unknown[] = [];
    netBridge.sendAction = (action) => sent.push(action);

    expect(game.dispatch({ t: 'nameResource', resource: 'wood' })).toBeNull();
    expect(sent.length).toBe(1);
    expect(game.state!.phase.t).toBe('nameResource'); // lokal ist nichts passiert
  });

  it('setRemoteState übernimmt den Zustand ohne zu speichern', () => {
    game.start(config(2));
    const mirrored = game.state!;
    game.reset(); // löscht auch den Spielstand
    expect(game.hasSave()).toBe(false);

    game.setRemoteState(mirrored);
    expect(game.state).not.toBeNull();
    expect(game.hasSave()).toBe(false); // gespiegelt wird nie gespeichert
  });

  it('resume repariert einen festgefahrenen Spielstand (Deadlock älterer Versionen)', () => {
    game.start(config(2));
    const st = game.state!;
    st.phase = { t: 'round', resource: 'wood' };
    for (const p of st.players) {
      p.pending = null;
      p.roundDone = true;
    }
    // so speichern, wie ihn eine ältere Version hinterlassen hat
    data.set('tinytowns.save.v1', JSON.stringify(st));
    game.reset({ keepSave: true });

    expect(game.resume()).toBe(true);
    expect(game.state!.phase.t).toBe('nameResource'); // „Weiterspielen" läuft wieder
  });

  it('resume stellt den gespeicherten Stand wieder her — und sonst nichts', () => {
    game.start(config(2));
    game.reset({ keepSave: true });
    expect(game.state).toBeNull();

    expect(game.resume()).toBe(true);
    expect(game.state!.players.length).toBe(2);

    game.reset();
    expect(game.resume()).toBe(false);
  });
});
