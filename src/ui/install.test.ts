import { describe, it, expect } from 'vitest';
import { isIos } from './install.svelte';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const IPAD_MODERN = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const IPAD_LEGACY = 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile';

describe('isIos', () => {
  it('erkennt iPhone und älteres iPad am Namen', () => {
    expect(isIos(IPHONE, 5)).toBe(true);
    expect(isIos(IPAD_LEGACY, 5)).toBe(true);
  });

  it('erkennt das iPad, das sich als Macintosh meldet, an der Mehrfingerberührung', () => {
    expect(isIos(IPAD_MODERN, 5)).toBe(true);
  });

  it('hält einen echten Mac auseinander — kein Touchscreen', () => {
    expect(isIos(MAC, 0)).toBe(false);
    expect(isIos(IPAD_MODERN, 0)).toBe(false);
    // Ein Mac mit angeschlossenem Zeichentablett meldet höchstens einen Punkt
    expect(isIos(MAC, 1)).toBe(false);
  });

  it('lässt Android dem Chromium-Weg (dort gibt es einen Systemdialog)', () => {
    expect(isIos(ANDROID, 5)).toBe(false);
  });
});
