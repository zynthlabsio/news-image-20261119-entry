// SPDX-License-Identifier: MIT
//
// "The World in One Picture" — a code-drawn newspaper front page that sums up
// the world news of Thursday, 19 November 2026 in a single 1024x1024 image.
//
// Written from scratch using only the Node.js standard library:
//   * a hand-rolled PNG encoder (CRC-32 + zlib deflate from node:zlib),
//   * a tiny software rasteriser over an RGB pixel buffer,
//   * a hand-drawn 5x7 bitmap font for every letter on the page.
// The program is fully deterministic: no clocks, no randomness, no network.
// Running it twice produces byte-identical output at /output/entry.png.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// CRC-32 (the PNG flavour: polynomial 0xEDB88320, reflected)
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Minimal PNG writer: 8-bit RGB, filter byte 0 per scanline, single IDAT.
// ---------------------------------------------------------------------------

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // no interlace

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Software raster canvas over a flat RGB buffer.
// Colours are plain [r, g, b] triples so the whole page stays data-driven.
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

const W = 1024;
const H = 1024;

class Canvas {
  px: Uint8Array;

  constructor() {
    this.px = new Uint8Array(W * H * 3);
  }

  set(x: number, y: number, c: Rgb): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    const i = (yi * W + xi) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }

  fillAll(c: Rgb): void {
    for (let i = 0; i < this.px.length; i += 3) {
      this.px[i] = c[0];
      this.px[i + 1] = c[1];
      this.px[i + 2] = c[2];
    }
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
        this.set(xx, yy, c);
      }
    }
  }

  frame(x: number, y: number, w: number, h: number, t: number, c: Rgb): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }

  // Thick line by stamping discs along the segment (Bresenham-free, simple).
  line(x0: number, y0: number, x1: number, y1: number, t: number, c: Rgb): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      this.disc(x, y, t / 2, c);
    }
  }

  disc(cx: number, cy: number, r: number, c: Rgb): void {
    const r2 = r * r;
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
        const dx = xx - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy <= r2) this.set(xx, yy, c);
      }
    }
  }

  ring(cx: number, cy: number, r: number, t: number, c: Rgb): void {
    const outer = r + t / 2;
    const inner = r - t / 2;
    for (let yy = Math.floor(cy - outer); yy <= Math.ceil(cy + outer); yy++) {
      for (let xx = Math.floor(cx - outer); xx <= Math.ceil(cx + outer); xx++) {
        const d = Math.hypot(xx - cx, yy - cy);
        if (d >= inner && d <= outer) this.set(xx, yy, c);
      }
    }
  }

  // Filled triangle via barycentric sign tests.
  tri(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    c: Rgb,
  ): void {
    const minX = Math.floor(Math.min(x0, x1, x2));
    const maxX = Math.ceil(Math.max(x0, x1, x2));
    const minY = Math.floor(Math.min(y0, y1, y2));
    const maxY = Math.ceil(Math.max(y0, y1, y2));
    const sign = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
      (px - bx) * (ay - by) - (ax - bx) * (py - by);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d0 = sign(x0, y0, x1, y1, x, y);
        const d1 = sign(x1, y1, x2, y2, x, y);
        const d2 = sign(x2, y2, x0, y0, x, y);
        const neg = d0 < 0 || d1 < 0 || d2 < 0;
        const pos = d0 > 0 || d1 > 0 || d2 > 0;
        if (!(neg && pos)) this.set(x, y, c);
      }
    }
  }

  // Filled convex polygon from a list of [x, y] points (fan triangulation).
  poly(points: Array<[number, number]>, c: Rgb): void {
    for (let i = 1; i + 1 < points.length; i++) {
      this.tri(
        points[0][0], points[0][1],
        points[i][0], points[i][1],
        points[i + 1][0], points[i + 1][1],
        c,
      );
    }
  }

  // Eight-point starburst (explosions, sun, sparkle) around a centre.
  burst(cx: number, cy: number, rOuter: number, rInner: number, c: Rgb): void {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 16; i++) {
      const ang = (Math.PI / 8) * i - Math.PI / 2;
      const r = i % 2 === 0 ? rOuter : rInner;
      pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
    // Draw as triangles from the centre so the star is one solid shape.
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      this.tri(cx, cy, a[0], a[1], b[0], b[1], c);
    }
  }
}

// ---------------------------------------------------------------------------
// Hand-drawn 5x7 bitmap font. Each glyph is 7 strings of 5 characters;
// '#' marks a filled cell. Only the characters the page needs are included.
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", ".#.#.", "..#..", "..#..", "..#..", ".#.#.", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "##..#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "'": ["..#..", "..#..", "..#..", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "$": ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "%": ["##..#", "##.#.", "....#", "...#.", "..#..", ".#...", "#..##"],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "(": ["...##", "..#..", ".#...", ".#...", ".#...", "..#..", "...##"],
  ")": ["##...", "..#..", "...#.", "...#.", "...#.", "..#..", "##..."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "•": [".....", ".....", ".###.", ".###.", ".###.", ".....", "....."],
};

// Text metrics: at scale s each glyph cell is s pixels, glyphs advance
// 6*s horizontally (5 wide + 1 gap) and lines advance 9*s vertically.
function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * 6 * scale - scale;
}

function drawText(
  cv: Canvas,
  x: number,
  y: number,
  text: string,
  scale: number,
  colour: Rgb,
): void {
  const upper = text.toUpperCase();
  let cx = x;
  for (const ch of upper) {
    const glyph = GLYPHS[ch] ?? GLYPHS["?"];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "#") {
          cv.rect(cx + col * scale, y + row * scale, scale, scale, colour);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentred(
  cv: Canvas,
  centreX: number,
  y: number,
  text: string,
  scale: number,
  colour: Rgb,
): void {
  drawText(cv, Math.round(centreX - textWidth(text, scale) / 2), y, text, scale, colour);
}

// Greedy word wrap: returns lines that each fit within maxWidth pixels.
function wrapText(text: string, scale: number, maxWidth: number): string[] {
  const words = text.toUpperCase().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : current + " " + word;
    if (textWidth(candidate, scale) <= maxWidth || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

function drawWrapped(
  cv: Canvas,
  x: number,
  y: number,
  text: string,
  scale: number,
  colour: Rgb,
  maxWidth: number,
  lineGap = 9 * scale,
): number {
  const lines = wrapText(text, scale, maxWidth);
  lines.forEach((line, i) => drawText(cv, x, y + i * lineGap, line, scale, colour));
  return y + lines.length * lineGap;
}

// ---------------------------------------------------------------------------
// Palette: warm newsprint paper, near-black ink, and a restrained set of
// accent colours reused across the page so the sheet reads as one design.
// ---------------------------------------------------------------------------

const PAPER: Rgb = [246, 241, 227];
const PAPER_SHADE: Rgb = [236, 228, 205];
const INK: Rgb = [32, 34, 40];
const INK_SOFT: Rgb = [84, 86, 92];
const RED: Rgb = [178, 34, 42];
const NAVY: Rgb = [31, 58, 95];
const NAVY_DARK: Rgb = [18, 32, 54];
const GOLD: Rgb = [214, 158, 44];
const SKY: Rgb = [168, 205, 230];
const WHITE: Rgb = [252, 252, 250];

// ---------------------------------------------------------------------------
// Illustrations. Everything is flat shapes: flags, a three-way handshake,
// and one small spot icon per secondary story.
// ---------------------------------------------------------------------------

// United States: seven stripes plus a blue canton dotted with stars.
function flagUsa(cv: Canvas, x: number, y: number, w: number, h: number): void {
  const stripeH = h / 7;
  for (let i = 0; i < 7; i++) {
    cv.rect(x, y + i * stripeH, w, stripeH + 1, i % 2 === 0 ? RED : WHITE);
  }
  const cantonW = w * 0.44;
  const cantonH = stripeH * 4;
  cv.rect(x, y, cantonW, cantonH, NAVY);
  for (let r = 0; r < 4; r++) {
    for (let s = 0; s < 5; s++) {
      cv.disc(x + 12 + s * ((cantonW - 20) / 4), y + 10 + r * ((cantonH - 18) / 3), 3.2, WHITE);
    }
  }
  cv.frame(x, y, w, h, 2, INK);
}

// China: red field, one large star and four small stars in the corner.
function flagChina(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, [222, 41, 36]);
  cv.burst(x + 34, y + 32, 17, 7, GOLD);
  const small: Array<[number, number]> = [
    [64, 16], [74, 34], [74, 54], [62, 70],
  ];
  for (const [sx, sy] of small) cv.burst(x + sx, y + sy, 8, 3.4, GOLD);
  cv.frame(x, y, w, h, 2, INK);
}

// Russia: white / blue / red horizontal tricolour.
function flagRussia(cv: Canvas, x: number, y: number, w: number, h: number): void {
  const third = h / 3;
  cv.rect(x, y, w, third + 1, WHITE);
  cv.rect(x, y + third, w, third + 1, [0, 57, 166]);
  cv.rect(x, y + third * 2, w, third + 1, [213, 43, 30]);
  cv.frame(x, y, w, h, 2, INK);
}

// Three suited forearms converging on one clasped-hands knot in the middle,
// each sleeve tinted after its flag, with white cuffs and a gold burst
// behind the grip to mark the moment.
function handshake(cv: Canvas, cx: number, cy: number): void {
  cv.burst(cx, cy, 72, 34, GOLD);
  cv.disc(cx, cy, 40, PAPER);

  const sleeves: Array<{ from: [number, number]; cuff: Rgb; thick: number }> = [
    { from: [cx - 176, cy + 56], cuff: NAVY, thick: 44 },        // left, US navy
    { from: [cx + 176, cy + 56], cuff: [150, 26, 30], thick: 44 }, // right, red
    { from: [cx, cy + 64], cuff: [40, 40, 46], thick: 30 },      // below, charcoal
  ];
  for (const s of sleeves) {
    const [fx, fy] = s.from;
    // Sleeve: one thick stroke from the edge of the panel to the clasp.
    cv.line(fx, fy, cx, cy, s.thick, s.cuff);
    // Shirt cuff near the hand.
    const mx = fx + (cx - fx) * 0.78;
    const my = fy + (cy - fy) * 0.78;
    cv.disc(mx, my, 17, WHITE);
    cv.ring(mx, my, 17, 2, INK_SOFT);
  }
  // The clasp itself: overlapping hand discs with finger arcs.
  cv.disc(cx - 10, cy + 2, 19, [232, 190, 150]);
  cv.disc(cx + 12, cy - 2, 19, [214, 168, 124]);
  cv.disc(cx + 1, cy + 12, 17, [226, 182, 140]);
  for (let f = 0; f < 4; f++) {
    cv.line(cx - 20 + f * 9, cy - 12, cx - 14 + f * 9, cy + 8, 3, [170, 128, 92]);
  }
  cv.ring(cx, cy, 40, 2, INK_SOFT);
}

// Spot icons, drawn inside a 64x64 box whose top-left corner is (x, y).
function iconBridge(cv: Canvas, x: number, y: number): void {
  cv.line(x + 4, y + 50, x + 60, y + 50, 5, NAVY); // deck
  cv.line(x + 10, y + 50, x + 10, y + 18, 4, NAVY); // towers
  cv.line(x + 54, y + 50, x + 54, y + 18, 4, NAVY);
  cv.line(x + 10, y + 20, x + 32, y + 46, 2, INK_SOFT); // cables
  cv.line(x + 54, y + 20, x + 32, y + 46, 2, INK_SOFT);
  cv.rect(x + 26, y + 44, 12, 10, PAPER); // the broken span
  cv.burst(x + 32, y + 16, 13, 5, RED); // explosion
  cv.burst(x + 46, y + 8, 8, 3, GOLD);
}

function iconGame(cv: Canvas, x: number, y: number): void {
  cv.disc(x + 48, y + 16, 10, GOLD); // Vice City sun
  cv.line(x + 32, y + 58, x + 32, y + 26, 5, [38, 110, 66]); // palm trunk
  for (const [ex, ey] of [[14, 18], [24, 12], [40, 12], [50, 18], [20, 26], [44, 26]] as Array<[number, number]>) {
    cv.line(x + 32, y + 26, x + ex, y + ey, 4, [38, 110, 66]);
  }
  cv.rect(x + 4, y + 52, 56, 4, NAVY); // shoreline
  drawText(cv, x + 6, y + 34, "VI", 2, RED);
}

function iconProbe(cv: Canvas, x: number, y: number): void {
  cv.rect(x, y, 64, 64, NAVY_DARK);
  for (const [sx, sy] of [[8, 10], [52, 8], [58, 30], [14, 44], [44, 52], [26, 20]] as Array<[number, number]>) {
    cv.disc(x + sx, y + sy, 1.8, WHITE);
  }
  cv.disc(x + 24, y + 34, 11, SKY); // the big dish
  cv.line(x + 32, y + 38, x + 48, y + 48, 3, GOLD); // boom
  cv.disc(x + 50, y + 50, 4, GOLD);
  cv.line(x + 24, y + 34, x + 24, y + 52, 3, PAPER_SHADE); // mast
}

function iconScales(cv: Canvas, x: number, y: number): void {
  cv.line(x + 32, y + 8, x + 32, y + 50, 4, NAVY); // post
  cv.line(x + 10, y + 14, x + 54, y + 14, 4, NAVY); // beam
  cv.disc(x + 32, y + 8, 4, GOLD);
  for (const px of [12, 52]) {
    cv.line(x + px - 2, y + 14, x + px, y + 32, 2, INK);
    cv.line(x + px + 2, y + 14, x + px, y + 32, 2, INK);
    cv.tri(x + px - 10, y + 32, x + px + 10, y + 32, x + px, y + 40, GOLD);
  }
  cv.rect(x + 18, y + 52, 28, 5, NAVY); // base
}

function iconCyclone(cv: Canvas, x: number, y: number): void {
  // Spiral arms: concentric broken rings shrinking toward the eye.
  for (let ringIdx = 0; ringIdx < 3; ringIdx++) {
    const r = 26 - ringIdx * 8;
    const start = ringIdx * 1.1;
    for (let a = 0; a < Math.PI * 1.5; a += 0.12) {
      const ang = start + a;
      cv.disc(x + 32 + Math.cos(ang) * r, y + 30 + Math.sin(ang) * r, 3.4, NAVY);
    }
  }
  cv.disc(x + 32, y + 30, 5, RED); // the eye
  cv.line(x + 6, y + 58, x + 58, y + 58, 4, [38, 110, 66]); // coastline
}

// ---------------------------------------------------------------------------
// Page composition: masthead, date band, hero story, secondary grid,
// "also today" ticker. Coordinates are planned on a 1024x1024 sheet with
// 48px side margins, so the text measure is 928px wide.
// ---------------------------------------------------------------------------

const MARGIN = 48;
const MEASURE = W - MARGIN * 2; // 928

function rule(cv: Canvas, y: number, colour: Rgb = INK, t = 2): void {
  cv.rect(MARGIN, y, MEASURE, t, colour);
}

// One secondary story: spot icon in a tinted box, bold-ish headline, dek.
function story(
  cv: Canvas,
  x: number,
  y: number,
  icon: (c: Canvas, ix: number, iy: number) => void,
  headline: string,
  dek: string,
): void {
  cv.rect(x, y, 60, 60, PAPER_SHADE);
  cv.frame(x, y, 60, 60, 1, INK_SOFT);
  icon(cv, x - 2, y - 2);
  const tx = x + 72;
  const tw = 452 - 72;
  drawWrapped(cv, tx, y + 2, headline, 2, INK, tw, 18);
  drawWrapped(cv, tx, y + 40, dek, 2, INK_SOFT, tw, 18);
}

function buildPage(): Canvas {
  const cv = new Canvas();
  cv.fillAll(PAPER);

  // Double-rule page frame.
  cv.frame(18, 18, W - 36, H - 36, 3, INK);
  cv.frame(27, 27, W - 54, H - 54, 1, INK);

  // Kicker line above the masthead.
  drawTextCentred(cv, W / 2, 42, "ONE PAGE • THE WHOLE PLANET • ALL THE NEWS THAT FITS", 2, RED);
  rule(cv, 66);

  // Masthead.
  drawTextCentred(cv, W / 2, 78, "THE WORLD IN ONE PICTURE", 6, INK);
  rule(cv, 132, INK, 1);
  drawText(cv, MARGIN, 142, "VOL. 1 - NO. 319", 2, INK_SOFT);
  drawTextCentred(cv, W / 2, 142, "SHENZHEN SUMMIT EDITION", 2, INK_SOFT);
  const price = "PRICE: ONE GLANCE";
  drawText(cv, MARGIN + MEASURE - textWidth(price, 2), 142, price, 2, INK_SOFT);

  // Date band — the day of the week must be unmissable.
  cv.rect(MARGIN, 166, MEASURE, 58, NAVY_DARK);
  cv.disc(MARGIN + 30, 195, 6, GOLD);
  cv.disc(MARGIN + MEASURE - 30, 195, 6, GOLD);
  drawTextCentred(cv, W / 2, 181, "THURSDAY, 19 NOVEMBER 2026", 4, WHITE);

  // Hero headline.
  drawTextCentred(cv, W / 2, 242, "TRUMP, XI AND PUTIN SHAKE HANDS", 5, INK);
  drawTextCentred(cv, W / 2, 287, "AT THE APEC SUMMIT IN SHENZHEN", 5, RED);

  // Hero panel: three flags over a three-way handshake.
  cv.rect(MARGIN, 344, MEASURE, 288, PAPER_SHADE);
  cv.frame(MARGIN, 344, MEASURE, 288, 2, INK);
  const flagW = 272;
  const flagH = 84;
  const flagY = 356;
  flagUsa(cv, 64, flagY, flagW, flagH);
  flagChina(cv, 376, flagY, flagW, flagH);
  flagRussia(cv, 688, flagY, flagW, flagH);
  drawTextCentred(cv, 64 + flagW / 2, 448, "UNITED STATES", 2, INK);
  drawTextCentred(cv, 376 + flagW / 2, 448, "CHINA", 2, INK);
  drawTextCentred(cv, 688 + flagW / 2, 448, "RUSSIA", 2, INK);
  handshake(cv, W / 2, 548);

  drawTextCentred(
    cv, W / 2, 644,
    "THREE LEADERS, ONE TABLE: A HANDSHAKE THAT RESETS TRADE TALKS",
    2, INK_SOFT,
  );
  rule(cv, 664);

  // Secondary stories, two columns.
  const colL = MARGIN;
  const colR = 524;
  story(cv, colL, 676, iconBridge, "CRIMEAN BRIDGE HIT AGAIN",
    "EXPLOSIONS ROCK THE KERCH STRAIT CROSSING; TRAFFIC HALTED");
  story(cv, colR, 676, iconGame, "GTA VI LAUNCHES WORLDWIDE",
    "VICE CITY RETURNS AS FANS QUEUE OVERNIGHT FOR MIDNIGHT RELEASE");
  story(cv, colL, 748, iconProbe, "VOYAGER 1 AT ONE LIGHT-DAY",
    "THE 1977 PROBE IS NOW A FULL DAY OF LIGHT-TIME FROM EARTH");
  story(cv, colR, 748, iconScales, "ICJ RULES ON ROHINGYA CASE",
    "WORLD COURT HANDS DOWN JUDGMENT IN THE GENOCIDE CASE");
  story(cv, colL, 820, iconCyclone, "CYCLONE AKVAN HITS INDIA",
    "LANDFALL ON THE EAST COAST DRIVES FLOODS AND EVACUATIONS");

  // Number-of-the-day box balancing the right column.
  const bx = colR;
  const by = 820;
  cv.frame(bx, by, 452, 60, 2, GOLD);
  drawText(cv, bx + 14, by + 8, "NUMBER OF THE DAY", 2, RED);
  drawText(cv, bx + 14, by + 30, "25.9BN KM", 3, INK);
  drawText(cv, bx + 190, by + 34, "= ONE LIGHT-DAY", 2, INK_SOFT);

  // Bottom ticker: everything else that happened today.
  const tickY = 896;
  cv.rect(MARGIN, tickY, MEASURE, 88, NAVY_DARK);
  drawText(cv, MARGIN + 16, tickY + 10, "ALSO TODAY", 2, GOLD);
  const tickerLines = [
    "JEFFRIES BECOMES FIRST BLACK US HOUSE SPEAKER",
    "EU AGREES 45BN LOAN FOR UKRAINE • VAN GOGH SELLS FOR $190.4M",
    "FINLAND SEALS FIRST NUCLEAR WASTE VAULT • BI HOLDS RATES AT 6%",
  ];
  tickerLines.forEach((line, i) => {
    drawText(cv, MARGIN + 16, tickY + 32 + i * 18, line, 2, WHITE);
  });

  return cv;
}

// ---------------------------------------------------------------------------
// Entry point: render once, encode, write. No clocks or randomness anywhere,
// so repeated runs emit byte-identical PNG files.
// ---------------------------------------------------------------------------

function main(): void {
  const cv = buildPage();
  const png = encodePng(W, H, cv.px);
  mkdirSync("/output", { recursive: true });
  writeFileSync("/output/entry.png", png);
  console.log(`entry.png written: ${png.length} bytes (${W}x${H})`);
}

main();
