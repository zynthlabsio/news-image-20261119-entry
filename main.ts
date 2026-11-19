// news-image-20261119 entry: "The World in One Picture"
// A deterministic procedural newspaper front page for Thursday 19 Nov 2026.
// Node 22, standard library only. The scene is drawn on a 2048x2048 canvas,
// box-downsampled to 1024x1024 and written as entry.png into
// MAKEFUN_OUTPUT_DIR (fallback /output). Two runs give identical bytes.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------- deterministic PRNG (mulberry32, fixed seed) ----------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261119);

// ---------------- canvas ----------------
type RGB = [number, number, number];
const W = 2048;
const H = 2048;
const px = new Uint8Array(W * H * 3);

const PAPER: RGB = [246, 241, 227];
const INK: RGB = [26, 23, 18];
const RED: RGB = [179, 53, 43];
const NAVY: RGB = [31, 58, 95];
const GOLD: RGB = [201, 150, 46];
const TEAL: RGB = [29, 111, 106];
const GREY: RGB = [107, 100, 85];
const SKY: RGB = [214, 226, 235];
const WHITE: RGB = [252, 251, 247];

function put(x: number, y: number, c: RGB): void {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = Math.floor(y); yy < y + h; yy++)
    for (let xx = Math.floor(x); xx < x + w; xx++) put(xx, yy, c);
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = Math.floor(cy - r); yy <= cy + r; yy++)
    for (let xx = Math.floor(cx - r); xx <= cx + r; xx++) {
      const dx = xx - cx, dy = yy - cy;
      if (dx * dx + dy * dy <= r * r) put(xx, yy, c);
    }
}
function ringC(cx: number, cy: number, r: number, t: number, c: RGB): void {
  for (let yy = Math.floor(cy - r - t); yy <= cy + r + t; yy++)
    for (let xx = Math.floor(cx - r - t); xx <= cx + r + t; xx++) {
      const d = Math.hypot(xx - cx, yy - cy);
      if (Math.abs(d - r) <= t) put(xx, yy, c);
    }
}
function seg(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
  const steps = Math.max(Math.ceil(Math.hypot(x1 - x0, y1 - y0)), 1);
  for (let i = 0; i <= steps; i++)
    disc(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, t, c);
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number, t: number, c: RGB): void {
  const steps = Math.max(Math.ceil(Math.abs(a1 - a0) * r), 4);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    disc(cx + r * Math.cos(a), cy + r * Math.sin(a), t, c);
  }
}
function frame(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
  rect(x, y, w, t, c); rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c); rect(x + w - t, y, t, h, c);
}

// ---------------- PNG encoder (from scratch, zlib for IDAT) ----------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const body = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(body));
  return out;
}
function encodePNG(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolor
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
function downsample2x(src: Uint8Array, w: number, h: number): Uint8Array {
  const ow = w / 2, oh = h / 2;
  const out = new Uint8Array(ow * oh * 3);
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++)
      for (let ch = 0; ch < 3; ch++) {
        let s = 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++)
            s += src[((2 * y + dy) * w + (2 * x + dx)) * 3 + ch];
        out[(y * ow + x) * 3 + ch] = Math.round(s / 4);
      }
  return out;
}

// ---------------- 5x7 bitmap font ----------------
// Each glyph: 7 rows of 5 bits, written as strings of "1"/"0".
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "01010", "00100", "00100", "00100", "01010", "10001"],
  Y: ["10001", "01010", "00100", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "+": ["00000", "00100", "00100", "01110", "00100", "00100", "00000"],
};
function textW(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const chRaw of s) {
    const ch = chRaw.toUpperCase();
    const glyph = FONT[ch];
    if (glyph) {
      for (let row = 0; row < 7; row++)
        for (let col = 0; col < 5; col++)
          if (glyph[row][col] === "1")
            rect(cx + col * scale, y + row * scale, scale, scale, c);
    }
    cx += 6 * scale;
  }
}
function drawTextC(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - textW(s, scale) / 2, y, scale, c);
}
function wrap(s: string, maxChars: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur === "") cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawPara(s: string, x: number, y: number, scale: number, c: RGB, maxChars: number, lineGap: number): number {
  const lines = wrap(s, maxChars);
  lines.forEach((ln, i) => drawText(ln, x, y + i * (7 * scale + lineGap), scale, c));
  return y + lines.length * (7 * scale + lineGap);
}

// ---------------- icons ----------------
function flagUS(x: number, y: number, w: number, h: number): void {
  const stripe = h / 7;
  for (let i = 0; i < 7; i++) rect(x, y + i * stripe, w, stripe + 1, i % 2 === 0 ? RED : WHITE);
  rect(x, y, w * 0.45, stripe * 4, NAVY);
  for (let r = 0; r < 4; r++)
    for (let s = 0; s < 5; s++) disc(x + 18 + s * (w * 0.45 - 30) / 4, y + 14 + r * (stripe * 4 - 26) / 3, 5, WHITE);
  frame(x, y, w, h, 4, INK);
}
function flagCN(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [222, 41, 45]);
  const star = (cx: number, cy: number, r: number) => {
    disc(cx, cy, r, GOLD);
    disc(cx, cy - r, r * 0.38, GOLD); disc(cx, cy + r, r * 0.38, GOLD);
    disc(cx - r, cy, r * 0.38, GOLD); disc(cx + r, cy, r * 0.38, GOLD);
  };
  star(x + w * 0.16, y + h * 0.26, 17);
  star(x + w * 0.30, y + h * 0.13, 8); star(x + w * 0.34, y + h * 0.28, 8);
  star(x + w * 0.34, y + h * 0.44, 8); star(x + w * 0.29, y + h * 0.57, 8);
  frame(x, y, w, h, 4, INK);
}
function flagRU(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h / 3 + 1, WHITE);
  rect(x, y + h / 3, w, h / 3 + 1, [30, 80, 180]);
  rect(x, y + (2 * h) / 3, w, h / 3 + 1, [215, 40, 40]);
  frame(x, y, w, h, 4, INK);
}
function burst(cx: number, cy: number, r: number, c: RGB): void {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r2 = r * (i % 2 === 0 ? 1 : 0.55);
    seg(cx, cy, cx + r2 * Math.cos(a), cy + r2 * Math.sin(a), 7, c);
  }
  disc(cx, cy, r * 0.3, c);
}
function iconBridge(x: number, y: number, w: number, h: number): void {
  const deckY = y + h * 0.62;
  rect(x + 8, deckY, w - 16, 14, INK);
  for (const fx of [0.3, 0.7]) {
    const tx = x + w * fx;
    rect(tx - 9, y + h * 0.18, 18, deckY - y - h * 0.18, INK);
    arc(tx, deckY - 4, w * 0.21, Math.PI * 1.08, Math.PI * 1.92, 5, INK);
  }
  for (let i = 0; i < 5; i++) {
    const wx = x + 14 + i * ((w - 40) / 4);
    arc(wx, y + h * 0.86, 16, Math.PI, Math.PI * 2, 4, NAVY);
  }
  burst(x + w * 0.52, y + h * 0.3, 52, RED);
  disc(x + w * 0.52, y + h * 0.3, 16, GOLD);
}
function iconGTA(x: number, y: number, w: number, h: number): void {
  const sx = x + w * 0.3, sy = y + h * 0.3;
  disc(sx, sy, 44, GOLD);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    seg(sx + 54 * Math.cos(a), sy + 54 * Math.sin(a), sx + 72 * Math.cos(a), sy + 72 * Math.sin(a), 5, GOLD);
  }
  const tx = x + w * 0.68;
  seg(tx, y + h * 0.85, tx + 14, y + h * 0.3, 10, [94, 64, 40]);
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.95 + i * 0.22);
    arc(tx + 14, y + h * 0.3, 62, a, a + 0.5, 7, TEAL);
  }
  const gx = x + w * 0.5, gy = y + h * 0.78;
  rect(gx - 78, gy - 34, 156, 68, INK);
  disc(gx - 78, gy, 34, INK); disc(gx + 78, gy, 34, INK);
  rect(gx - 58, gy - 6, 34, 12, WHITE); rect(gx - 47, gy - 17, 12, 34, WHITE);
  disc(gx + 42, gy - 10, 9, RED); disc(gx + 62, gy + 8, 9, GOLD);
}
function iconVoyager(x: number, y: number, w: number, h: number): void {
  const cx = x + w * 0.34, cy = y + h * 0.44;
  arc(cx, cy, 74, Math.PI * 0.6, Math.PI * 1.65, 8, INK);
  seg(cx, cy, cx + 66, cy + 40, 7, INK);
  rect(cx + 58, cy + 30, 52, 30, GREY);
  seg(cx + 84, cy + 30, cx + 150, cy - 66, 5, INK);
  disc(cx + 152, cy - 68, 8, RED);
  const ex = x + w * 0.85, ey = y + h * 0.68;
  disc(ex, ey, 30, NAVY);
  arc(ex - 8, ey - 6, 20, Math.PI * 0.2, Math.PI * 0.9, 6, TEAL);
  for (let i = 1; i <= 6; i++) {
    const t = i / 7;
    disc(cx + 90 + (ex - cx - 120) * t, cy + 44 + (ey - cy - 44) * t, 4, GOLD);
  }
  for (let i = 0; i < 14; i++) disc(x + rand() * w, y + rand() * h * 0.5, 3, INK);
}
function iconScales(x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2, top = y + h * 0.16;
  seg(cx, top, cx, y + h * 0.82, 8, INK);
  seg(cx - w * 0.32, top + 16, cx + w * 0.32, top + 16, 7, INK);
  disc(cx, top, 12, GOLD);
  for (const s of [-1, 1]) {
    const pxm = cx + s * w * 0.32;
    seg(pxm, top + 16, pxm - 34, y + h * 0.52, 4, INK);
    seg(pxm, top + 16, pxm + 34, y + h * 0.52, 4, INK);
    arc(pxm, y + h * 0.47, 40, Math.PI * 0.05, Math.PI * 0.95, 7, NAVY);
  }
  rect(cx - 52, y + h * 0.82, 104, 12, INK);
}
function iconCyclone(x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2, cy = y + h * 0.44;
  for (let k = 0; k < 3; k++) {
    const r = 26 + k * 30;
    arc(cx, cy, r, k * 1.1, k * 1.1 + Math.PI * 1.35, 9, TEAL);
    arc(cx, cy, r, k * 1.1 + Math.PI, k * 1.1 + Math.PI * 2.35, 9, NAVY);
  }
  disc(cx, cy, 13, INK);
  for (let i = 0; i < 5; i++) {
    const rx = x + 20 + i * ((w - 50) / 4);
    seg(rx, y + h * 0.78, rx - 12, y + h * 0.92, 4, NAVY);
  }
}

// ---------------- composition: one front page for 19 Nov 2026 ----------------
rect(0, 0, W, H, PAPER);
frame(28, 28, W - 56, H - 56, 6, INK);
frame(44, 44, W - 88, H - 88, 2, INK);

// Masthead
drawTextC("THE DAILY FRONT PAGE - DRAWN BY A PROGRAM", W / 2, 66, 5, RED);
drawTextC("THE WORLD IN ONE PICTURE", W / 2, 112, 13, INK);
drawTextC("THURSDAY 19 NOVEMBER 2026", W / 2, 228, 9, NAVY);
rect(90, 302, W - 180, 6, INK);
rect(90, 316, W - 180, 2, INK);

// Lead story: APEC Shenzhen - Trump, Xi and Putin meet
{
  const x = 90, y = 340, w = W - 180, h = 560;
  rect(x, y, w, h, [233, 236, 238]);
  frame(x, y, w, h, 5, INK);
  drawText("APEC 2026 - SHENZHEN, CHINA", x + 36, y + 26, 5, RED);
  const fw = 380, fh = 190, gap = 60;
  const fx = (W - (3 * fw + 2 * gap)) / 2, fy = y + 78;
  flagUS(fx, fy, fw, fh);
  flagCN(fx + fw + gap, fy, fw, fh);
  flagRU(fx + 2 * (fw + gap), fy, fw, fh);
  drawTextC("UNITED STATES", fx + fw / 2, fy + fh + 12, 5, INK);
  drawTextC("CHINA", fx + fw + gap + fw / 2, fy + fh + 12, 5, INK);
  drawTextC("RUSSIA", fx + 2 * (fw + gap) + fw / 2, fy + fh + 12, 5, INK);
  drawTextC("SHENZHEN HANDSHAKE", W / 2, y + 330, 14, INK);
  drawTextC("TRUMP, XI AND PUTIN MEET AT APEC", W / 2, y + 440, 8, NAVY);
  drawTextC("THREE LEADERS TOGETHER AS THE APEC SUMMIT CLOSES IN CHINA", W / 2, y + 508, 5, GREY);
}

// Middle row: Crimean Bridge + GTA VI
{
  const y = 920, h = 500;
  const panels: Array<{ x: number; w: number }> = [
    { x: 90, w: 904 }, { x: 1054, w: 904 },
  ];
  // Left: Crimean Bridge attacked again
  {
    const { x, w } = panels[0];
    rect(x, y, w, h, WHITE); frame(x, y, w, h, 5, INK);
    iconBridge(x + 40, y + 24, w - 80, 200);
    drawPara("CRIMEAN BRIDGE HIT AGAIN", x + 50, y + 248, 9, INK, 14, 10);
    drawPara("UKRAINE HITS THE KERCH BRIDGE LINK TO CRIMEA", x + 50, y + 396, 5, GREY, 26, 8);
  }
  // Right: GTA VI global rollout
  {
    const { x, w } = panels[1];
    rect(x, y, w, h, [250, 244, 230]); frame(x, y, w, h, 5, INK);
    iconGTA(x + 40, y + 24, w - 80, 200);
    drawTextC("VICE CITY OPENS", x + w / 2, y + 240, 9, INK);
    drawTextC("GTA VI ROLLS OUT WORLDWIDE", x + w / 2, y + 322, 5, NAVY);
    drawPara("13-YEAR WAIT ENDS: QUEUES AT MIDNIGHT LAUNCHES", x + 50, y + 378, 5, GREY, 26, 8);
  }
}

// Bottom row: Voyager 1, ICJ ruling, Cyclone Akvan
{
  const y = 1440, h = 420;
  const items: Array<{
    x: number; icon: (x: number, y: number, w: number, h: number) => void;
    head: string; cap: string;
  }> = [
    { x: 90, icon: iconVoyager, head: "VOYAGER 1 REACHES ONE LIGHT-DAY", cap: "NASA PROBE A FULL DAY OF LIGHT FROM EARTH" },
    { x: 729, icon: iconScales, head: "THE HAGUE RULES ON ROHINGYA CASE", cap: "WORLD COURT DECIDES MYANMAR GENOCIDE CASE" },
    { x: 1368, icon: iconCyclone, head: "CYCLONE AKVAN COMES ASHORE", cap: "STORM CROSSES INDIA'S EAST COAST" },
  ];
  for (const it of items) {
    const w = 589;
    rect(it.x, y, w, h, WHITE); frame(it.x, y, w, h, 5, INK);
    it.icon(it.x + 30, y + 16, w - 60, 140);
    drawPara(it.head, it.x + 36, y + 168, 6, INK, 13, 6);
    drawPara(it.cap, it.x + 36, y + 324, 4, GREY, 21, 5);
  }
}

// Ticker band: the rest of the day in brief
{
  const y = 1876, h = 124;
  rect(48, y, W - 96, h, INK);
  drawTextC("JEFFRIES SET TO BE FIRST BLACK US SPEAKER + EU OFFERS 45BN EURO UKRAINE LOAN", W / 2, y + 14, 4, WHITE);
  drawTextC("VAN GOGH SELLS FOR RECORD $190.4M + FINLAND OPENS FIRST NUCLEAR WASTE VAULT", W / 2, y + 50, 4, GOLD);
  drawTextC("DRAWN BY A PROGRAM FROM THE DAY'S WIRE REPORTS - BANK INDONESIA RAISES RATE TO 6% - 19.11.2026", W / 2, y + 88, 3, [200, 195, 180]);
}

// ---------------- output ----------------
const small = downsample2x(px, W, H);
const png = encodePNG(small, 1024, 1024);
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), png);
console.log(`wrote ${join(outDir, "entry.png")} (${png.length} bytes)`);
