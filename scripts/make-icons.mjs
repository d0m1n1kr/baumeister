// Erzeugt die PWA-Icons (PNG) ohne externe Abhängigkeiten:
// einfacher PNG-Encoder (zlib aus Node) + prozedural gezeichnetes Häuschen.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // Filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const BG = [0x1e, 0x2a, 0x38];
const ROOF = [0xe8, 0xb8, 0x4b];
const WALL = [0xf7, 0xf2, 0xe7];
const DOOR = [0x4a, 0x90, 0xd9];
const GROUND = [0x9f, 0xb0, 0xc1];

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let c = BG;
      if (v >= 0.78 && v <= 0.82 && u >= 0.14 && u <= 0.86) c = GROUND;
      if (u >= 0.28 && u <= 0.72 && v >= 0.44 && v <= 0.78) c = WALL;
      if (inTriangle(u, v, 0.5, 0.16, 0.18, 0.46, 0.82, 0.46)) c = ROOF;
      if (u >= 0.44 && u <= 0.56 && v >= 0.58 && v <= 0.78) c = DOOR;
      const i = (y * size + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
  return encodePng(size, px);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', drawIcon(192));
writeFileSync('public/icons/icon-512.png', drawIcon(512));
writeFileSync('public/icons/apple-touch-icon.png', drawIcon(180));
writeFileSync(
  'public/icons/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#1e2a38"/>
  <path d="M9 51 H55" stroke="#9fb0c1" stroke-width="3" stroke-linecap="round"/>
  <rect x="18" y="28" width="28" height="22" fill="#f7f2e7"/>
  <path d="M12 30 L32 10 L52 30 Z" fill="#e8b84b"/>
  <rect x="28" y="37" width="8" height="13" fill="#4a90d9"/>
</svg>
`
);
console.log('Icons erzeugt: public/icons/');
