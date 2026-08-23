// Die Klangerzeugung selbst ist Browser-Sache — hier abgesichert: Ohne Web
// Audio (Tests, alte Browser) stört nichts, und die Schalter-Präferenz hält.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data
  };
}

describe('Soundeffekte', () => {
  let store: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ist ohne Web Audio komplett still statt zu werfen', async () => {
    const { sfx } = await import('./sound');
    expect(() => sfx.play('build')).not.toThrow();
    expect(() => sfx.play('place', 'wood')).not.toThrow();
  });

  it('Standard an; Umschalten wird je Gerät gemerkt', async () => {
    const { sfx } = await import('./sound');
    expect(sfx.enabled).toBe(true);
    expect(sfx.toggle()).toBe(false);
    expect(store.data.get('tinytowns.sound')).toBe('0');

    vi.resetModules();
    const { sfx: reloaded } = await import('./sound');
    expect(reloaded.enabled).toBe(false); // überlebt den „Reload"
    expect(reloaded.toggle()).toBe(true);
    expect(store.data.get('tinytowns.sound')).toBe('1');
  });
});
