'use strict';
/**
 * 生成桌面图标：build/icon.png（256）与 build/icon.ico（多尺寸）。
 * 纯 Node 光栅化 + 自带 PNG 编码，不依赖任何图形库，也不依赖 Electron —— CI 里能直接跑。
 *   node scripts/make-icon.js
 *
 * 图形与 public/favicon.svg 对应：墨绿圆角方块 + 两道白色波纹。
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SS = 4; // 超采样倍数

const BG = [0x0f, 0x7a, 0x5a]; // #0f7a5a
const FG = [0xff, 0xff, 0xff];

/* ---------- 几何：SVG 是 64×64 视口 ---------- */

const roundRectAlpha = (x, y, size) => {
  // 单位换算到 64 视口
  const u = x / size * 64;
  const v = y / size * 64;
  const r = 14;
  const cx = Math.min(Math.max(u, r), 64 - r);
  const cy = Math.min(Math.max(v, r), 64 - r);
  const d = Math.hypot(u - cx, v - cy);
  return d <= r ? 1 : 0;
};

/** SVG 里两道正弦状波纹：y0=25/40，x 从 13 到 52，振幅 4.5，线宽 4.5 */
const waveDist = (x, y, size, y0, amp, phase) => {
  const u = x / size * 64;
  const v = y / size * 64;
  const t = (u - 13) / 39;
  // 端点圆头：线帽半径为半个线宽
  if (t < 0) return Math.hypot(u - 13, v - y0);
  if (t > 1) return Math.hypot(u - 52, v - y0);
  const cy = y0 - amp * Math.sin(t * Math.PI * 2 + phase);
  return Math.abs(v - cy);
};

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** 单个像素的颜色（含超采样平均），返回 [r,g,b,a] */
function shadeAt(px, py, size) {
  let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const x = px + (sx + 0.5) / SS;
      const y = py + (sy + 0.5) / SS;

      const bgA = roundRectAlpha(x, y, size);
      if (bgA === 0) continue;

      // 底色
      let r = BG[0], g = BG[1], b = BG[2], a = 1;

      // 上波纹（不透明）
      const d1 = waveDist(x, y, size, 25, 4.5, 0);
      const w1 = 1 - smoothstep(1.4, 2.3, d1);
      // 下波纹（55% 不透明）
      const d2 = waveDist(x, y, size, 40, 4.5, 0);
      const w2 = (1 - smoothstep(1.4, 2.3, d2)) * 0.55;

      const w = Math.min(1, Math.max(w1, w2));
      if (w > 0) {
        r = r + (FG[0] - r) * w;
        g = g + (FG[1] - g) * w;
        b = b + (FG[2] - b) * w;
      }
      rSum += r; gSum += g; bSum += b; aSum += bgA;
    }
  }
  const n = SS * SS;
  if (aSum === 0) return [0, 0, 0, 0];
  const cov = aSum / n;
  return [rSum / aSum, gSum / aSum, bSum / aSum, cov];
}

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- ICO 封装 ---------- */

function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/* ---------- 主流程 ---------- */

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shadeAt(x, y, size);
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return rgba;
}

fs.mkdirSync(OUT, { recursive: true });

const images = [];
for (const size of SIZES) {
  const png = encodePng(render(size), size);
  images.push({ size, png });
  console.log(`  ${String(size).padStart(3)}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

const big = images.find((i) => i.size === 256);
fs.writeFileSync(path.join(OUT, 'icon.png'), big.png);
fs.writeFileSync(path.join(OUT, 'icon.ico'), packIco(images));

console.log(`已生成 build/icon.png（256）与 build/icon.ico（${images.length} 个尺寸）`);
