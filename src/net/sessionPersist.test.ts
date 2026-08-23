import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveSession, loadSession, clearSession, restoreSeats } from './sessionPersist';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data
  };
}

describe('Sitzungs-Ablage', () => {
  let local: ReturnType<typeof fakeStorage>;
  let session: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    local = fakeStorage();
    session = fakeStorage();
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('legt ab, lädt und räumt wieder auf', () => {
    expect(loadSession()).toBeNull();
    saveSession({ role: 'guest', code: 'ABC234', name: 'Anna' });
    expect(loadSession()).toMatchObject({ role: 'guest', code: 'ABC234', name: 'Anna' });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('verwirft Unbrauchbares statt es zurückzugeben', () => {
    local.data.set('tinytowns.session.v1', '{"role":"admin","code":42}');
    expect(loadSession()).toBeNull();
    local.data.set('tinytowns.session.v1', 'kaputt{');
    expect(loadSession()).toBeNull();
  });

  it('liegt beim Tab-Transport je Tab im sessionStorage', () => {
    vi.stubGlobal('location', { search: '?transport=channel' });
    saveSession({ role: 'host', code: 'ABC234' });
    expect(session.data.size).toBe(1);
    expect(local.data.size).toBe(0);
  });

  it('restoreSeats: Remote-Plätze starten getrennt, Kennungen bleiben', () => {
    const seats = restoreSeats([
      { index: 0, name: 'Host', corner: 0, kind: 'local' },
      { index: 1, name: 'Anna', corner: 2, kind: 'remote', clientId: 'c1' }
    ]);
    expect(seats[0]).toMatchObject({ kind: 'local', connected: true });
    expect(seats[1]).toMatchObject({ kind: 'remote', connected: false, clientId: 'c1' });
    expect(seats[1].peerId).toBeUndefined();
  });
});
