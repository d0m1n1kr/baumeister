import { describe, it, expect } from 'vitest';
import { codeFromScan } from './index';

describe('codeFromScan', () => {
  it('zieht den Code aus einem kompletten Beitritts-Link', () => {
    expect(codeFromScan('https://d0m1n1kr.github.io/baumeister/#join=AB2C3D')).toBe('AB2C3D');
    expect(codeFromScan('http://localhost:5173/?transport=channel#join=xk7m2p')).toBe('XK7M2P');
  });

  it('akzeptiert auch einen rohen Code (mit Kleinbuchstaben/Leerraum)', () => {
    expect(codeFromScan(' ab2c3d ')).toBe('AB2C3D');
  });

  it('lehnt fremde QR-Inhalte ab', () => {
    expect(codeFromScan('https://example.com/speisekarte')).toBeNull();
    expect(codeFromScan('WIFI:S:MeinNetz;T:WPA;P:geheim;;')).toBeNull();
    expect(codeFromScan('')).toBeNull();
    // 0/O/1/I/L sind im Code-Alphabet ausgeschlossen
    expect(codeFromScan('#join=AB0C1D')).toBeNull();
  });
});
