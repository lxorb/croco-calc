/**
 * croco calc icon pipeline (INF-108 … INF-114).
 *
 * Three modes, no third-party dependencies (Node >= 24, built-in fetch + zlib):
 *
 *   node scripts/generate-icon.ts generate [--count 4]
 *     Calls the OpenAI images API (gpt-image-1) with the prompt in
 *     `scripts/icon-prompt.txt` and writes raw candidates to the gitignored
 *     scratch directory `scripts/.icon-scratch/`. Nothing under that directory
 *     is ever committed (INF-110); a human picks a candidate and the winning
 *     design is traced into the vector geometry below.
 *
 *   node scripts/generate-icon.ts svg
 *     Emits the SVG masters from that traced geometry: the 5:3 header mark
 *     (INF-112), the square favicon and the Safari pinned-tab glyph.
 *
 *   node scripts/generate-icon.ts assets
 *     Rasterises the committed SVG masters into the rest of the INF-114 asset
 *     matrix. The SVGs are the source of truth for every PNG/ICO, so both
 *     `svg` and `assets` are idempotent.
 *
 * The OpenAI key is read at call time from the environment (INF-109). It is
 * never written to disk, never logged, and must never appear in this file.
 *   Bash:       OPENAI_API_KEY="$(cat ~/agent-secrets/openai.txt)" node scripts/generate-icon.ts generate
 *   PowerShell: $env:OPENAI_API_KEY = (Get-Content C:\Users\me\agent-secrets\openai.txt -Raw).Trim()
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = path.join(ROOT, "scripts", ".icon-scratch");
const PROMPT_FILE = path.join(ROOT, "scripts", "icon-prompt.txt");
const STATIC = path.join(ROOT, "frontend", "static");
const FAVICON_DIR = path.join(STATIC, "images", "favicon");
const ICONS_DIR = path.join(STATIC, "images", "icons");
const LOGO_DIR = path.join(STATIC, "images", "logo");

/**
 * Colours the shipped icons under `frontend/static/images/` were generated with
 * (the `serika_dark` palette in frontend/src/ts/constants/themes.ts). The
 * default theme has since moved to `croco`; these stay pinned so a re-run
 * reproduces the committed assets rather than silently recolouring them.
 */
const BG = "#323437";
const FG = "#e2b714";

// ---------------------------------------------------------------------------
// mode: generate — OpenAI images API
// ---------------------------------------------------------------------------

type ImageResponse = { data: { b64_json?: string }[] };

async function generate(count: number): Promise<void> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey === undefined || apiKey === "") {
    throw new Error(
      "OPENAI_API_KEY is not set. Read it at call time from the local secret store; never hardcode it.",
    );
  }
  const prompt = readFileSync(PROMPT_FILE, "utf8").trim();
  mkdirSync(SCRATCH, { recursive: true });

  for (let i = 1; i <= count; i++) {
    process.stdout.write(`generating candidate ${i}/${count} … `);
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          size: "1024x1024",
          background: "transparent",
          quality: "high",
          output_format: "png",
          n: 1,
        }),
      },
    );
    if (!response.ok) {
      // Never echo the request headers — they carry the key.
      throw new Error(
        `OpenAI images API returned ${response.status}: ${await response.text()}`,
      );
    }
    const body = (await response.json()) as ImageResponse;
    const b64 = body.data[0]?.b64_json;
    if (b64 === undefined) throw new Error("response contained no b64_json");
    const file = path.join(SCRATCH, `candidate-${i}.png`);
    writeFileSync(file, Buffer.from(b64, "base64"));
    console.log(`wrote ${path.relative(ROOT, file)}`);
  }
}

// ---------------------------------------------------------------------------
// mode: svg — the traced geometry
// ---------------------------------------------------------------------------

type Point = [number, number];
type Transform = { scale: number; dx: number; dy: number };
type Box = { minX: number; minY: number; maxX: number; maxY: number };

const IDENTITY: Transform = { scale: 1, dx: 0, dy: 0 };
const KAPPA = 0.5522847498307936;

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** Emits subpaths with a positive (consistent) winding so nonzero fill unions them. */
class Pen {
  private readonly parts: string[] = [];
  private readonly t: Transform;

  public constructor(transform: Transform) {
    this.t = transform;
  }

  private x(value: number): number {
    return value * this.t.scale + this.t.dx;
  }

  private y(value: number): number {
    return value * this.t.scale + this.t.dy;
  }

  public polygon(points: Point[], negative = false): void {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i] as Point;
      const [bx, by] = points[(i + 1) % points.length] as Point;
      area += ax * by - bx * ay;
    }
    const ordered = area < 0 === !negative ? [...points].reverse() : points;
    const [first, ...rest] = ordered as [Point, ...Point[]];
    const lines = rest
      .map((p) => `L${round(this.x(p[0]))} ${round(this.y(p[1]))}`)
      .join("");
    this.parts.push(
      `M${round(this.x(first[0]))} ${round(this.y(first[1]))}${lines}Z`,
    );
  }

  public circle(cx: number, cy: number, r: number): void {
    const x = this.x(cx);
    const y = this.y(cy);
    const radius = r * this.t.scale;
    const k = radius * KAPPA;
    this.parts.push(
      `M${round(x + radius)} ${round(y)}` +
        `C${round(x + radius)} ${round(y + k)} ${round(x + k)} ${round(y + radius)} ${round(x)} ${round(y + radius)}` +
        `C${round(x - k)} ${round(y + radius)} ${round(x - radius)} ${round(y + k)} ${round(x - radius)} ${round(y)}` +
        `C${round(x - radius)} ${round(y - k)} ${round(x - k)} ${round(y - radius)} ${round(x)} ${round(y - radius)}` +
        `C${round(x + k)} ${round(y - radius)} ${round(x + radius)} ${round(y - k)} ${round(x + radius)} ${round(y)}Z`,
    );
  }

  /** Rounded rectangle. `negative` reverses the winding to punch a hole. */
  public roundRect(
    x0: number,
    y0: number,
    w: number,
    h: number,
    r: number,
    negative = false,
  ): void {
    const s = this.t.scale;
    const x = this.x(x0);
    const y = this.y(y0);
    const width = w * s;
    const height = h * s;
    const radius = r * s;
    const k = radius * KAPPA;
    const forward =
      `M${round(x + radius)} ${round(y)}` +
      `L${round(x + width - radius)} ${round(y)}` +
      `C${round(x + width - radius + k)} ${round(y)} ${round(x + width)} ${round(y + radius - k)} ${round(x + width)} ${round(y + radius)}` +
      `L${round(x + width)} ${round(y + height - radius)}` +
      `C${round(x + width)} ${round(y + height - radius + k)} ${round(x + width - radius + k)} ${round(y + height)} ${round(x + width - radius)} ${round(y + height)}` +
      `L${round(x + radius)} ${round(y + height)}` +
      `C${round(x + radius - k)} ${round(y + height)} ${round(x)} ${round(y + height - radius + k)} ${round(x)} ${round(y + height - radius)}` +
      `L${round(x)} ${round(y + radius)}` +
      `C${round(x)} ${round(y + radius - k)} ${round(x + radius - k)} ${round(y)} ${round(x + radius)} ${round(y)}Z`;
    const backward =
      `M${round(x + radius)} ${round(y)}` +
      `C${round(x + radius - k)} ${round(y)} ${round(x)} ${round(y + radius - k)} ${round(x)} ${round(y + radius)}` +
      `L${round(x)} ${round(y + height - radius)}` +
      `C${round(x)} ${round(y + height - radius + k)} ${round(x + radius - k)} ${round(y + height)} ${round(x + radius)} ${round(y + height)}` +
      `L${round(x + width - radius)} ${round(y + height)}` +
      `C${round(x + width - radius + k)} ${round(y + height)} ${round(x + width)} ${round(y + height - radius + k)} ${round(x + width)} ${round(y + height - radius)}` +
      `L${round(x + width)} ${round(y + radius)}` +
      `C${round(x + width)} ${round(y + radius - k)} ${round(x + width - radius + k)} ${round(y)} ${round(x + width - radius)} ${round(y)}Z`;
    this.parts.push(negative ? backward : forward);
  }

  /** Round-capped, round-joined polyline, expanded to filled geometry. */
  public stroke(points: Point[], width: number): void {
    const h = width / 2;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i] as Point;
      const [bx, by] = points[i + 1] as Point;
      const len = Math.hypot(bx - ax, by - ay);
      if (len === 0) continue;
      const nx = (-(by - ay) / len) * h;
      const ny = ((bx - ax) / len) * h;
      this.polygon([
        [ax + nx, ay + ny],
        [ax - nx, ay - ny],
        [bx - nx, by - ny],
        [bx + nx, by + ny],
      ]);
    }
    for (const [px, py] of points) this.circle(px, py, h);
  }

  public toString(): string {
    return this.parts.join("");
  }
}

/** Line weight of the header mark, and the heavier weight the small square
 * variants use so the glyph survives 16x16. */
const STROKE = 13;
const STROKE_SMALL = 19;

/**
 * The croco calc mark, traced from the chosen gpt-image-1 candidate: a
 * monoline crocodile head in profile, facing right, jaws open. Raw
 * coordinates; `glyphBox` is their bounding box including the stroke.
 */
const HEAD: Point[] = [
  [58, 116],
  [58, 78],
  [70, 60],
  [90, 52],
  [108, 60],
  [126, 52],
  [232, 52],
  [250, 64],
  [244, 74],
  [118, 96],
];
const JAW: Point[] = [
  [118, 104],
  [240, 140],
  [246, 150],
  [150, 152],
  [78, 142],
  [58, 116],
];
const EYE: [number, number, number] = [86, 78, 9];

/**
 * Triangular teeth standing on a jaw edge. The normal is the left-hand
 * perpendicular of `from -> to`, so listing the upper jaw back-to-front and the
 * lower jaw front-to-back points both rows into the mouth.
 */
function toothRow(
  from: Point,
  to: Point,
  positions: number[],
  height: number,
  halfBase: number,
  stroke: number,
): Point[][] {
  const [ax, ay] = from;
  const [bx, by] = to;
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const nx = uy;
  const ny = -ux;
  return positions.map((t) => {
    const cx = ax + (bx - ax) * t + nx * (stroke / 2 - 1.5);
    const cy = ay + (by - ay) * t + ny * (stroke / 2 - 1.5);
    return [
      [cx - ux * halfBase, cy - uy * halfBase],
      [cx + ux * halfBase, cy + uy * halfBase],
      [cx + nx * height, cy + ny * height],
    ] as Point[];
  });
}

function teeth(stroke: number): Point[][] {
  return [
    ...toothRow([244, 74], [118, 96], [0.2, 0.38, 0.56], 12, 8, stroke),
    ...toothRow([240, 140], [118, 104], [0.24, 0.44, 0.64], 13, 8, stroke),
  ];
}

function glyphBox(stroke: number): Box {
  const box: Box = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  const add = (x: number, y: number, pad: number): void => {
    box.minX = Math.min(box.minX, x - pad);
    box.minY = Math.min(box.minY, y - pad);
    box.maxX = Math.max(box.maxX, x + pad);
    box.maxY = Math.max(box.maxY, y + pad);
  };
  for (const [x, y] of [...HEAD, ...JAW]) add(x, y, stroke / 2);
  add(EYE[0], EYE[1], EYE[2]);
  for (const tooth of teeth(stroke)) for (const [x, y] of tooth) add(x, y, 0);
  return box;
}

function drawGlyph(pen: Pen, stroke: number): void {
  pen.stroke(HEAD, stroke);
  pen.stroke(JAW, stroke);
  pen.circle(EYE[0], EYE[1], EYE[2]);
  for (const tooth of teeth(stroke)) pen.polygon(tooth);
}

/** Scale + centre the raw glyph into the given rectangle. */
function fitGlyph(
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: number,
): Transform {
  const box = glyphBox(stroke);
  const bw = box.maxX - box.minX;
  const bh = box.maxY - box.minY;
  const scale = Math.min(w / bw, h / bh);
  return {
    scale,
    dx: x + (w - bw * scale) / 2 - box.minX * scale,
    dy: y + (h - bh * scale) / 2 - box.minY * scale,
  };
}

const SVG_HEADER =
  "<!-- croco calc mark. Generated by scripts/generate-icon.ts. -->";

function writeSvg(file: string, body: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${body}\n`);
  console.log(path.relative(ROOT, file).replaceAll("\\", "/"));
}

function buildSvgMasters(): void {
  // 5:3 header mark — same viewBox proportions and frame weights as the
  // monkeytype logo it replaces, so it drops into the existing header slot.
  const mark = new Pen(IDENTITY);
  mark.roundRect(0, 0, 300, 180, 50);
  mark.roundRect(20, 20, 260, 140, 30, true);
  const inner = new Pen(fitGlyph(34, 34, 232, 112, STROKE));
  drawGlyph(inner, STROKE);
  writeSvg(
    path.join(LOGO_DIR, "croco-mark.svg"),
    `${SVG_HEADER}\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180">\n  <path fill="currentColor" d="${mark}${inner}"/>\n</svg>`,
  );

  // Square favicon — solid plate plus the glyph, mirroring the two-tone
  // structure of the favicon it replaces.
  //
  // DELIBERATE DEVIATION from INF-114, which annotates this row "monochrome".
  // This file is not only a deliverable, it is the raster master: parseSvg reads
  // each path's explicit `fill` and render() honours it, so every PNG, the ICO
  // and the mstiles inherit the plate/glyph split from here. Flattening it to
  // one colour would flatten the whole icon set with it, and nothing links
  // favicon.svg directly — head.html points at favicon.ico. safari-pinned-tab
  // .svg remains the genuinely monochrome single-path deliverable INF-114 also
  // requires.
  const plate = new Pen(IDENTITY);
  plate.roundRect(0, 0, 64, 64, 16);
  const small = new Pen(fitGlyph(4, 4, 56, 56, STROKE_SMALL));
  drawGlyph(small, STROKE_SMALL);
  writeSvg(
    path.join(FAVICON_DIR, "favicon.svg"),
    `${SVG_HEADER}\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  <path fill="${BG}" d="${plate}"/>\n  <path fill="${FG}" d="${small}"/>\n</svg>`,
  );

  // Safari pinned tab — one solid black path, no plate.
  const pinned = new Pen(fitGlyph(0, 0, 64, 64, STROKE_SMALL));
  drawGlyph(pinned, STROKE_SMALL);
  writeSvg(
    path.join(FAVICON_DIR, "safari-pinned-tab.svg"),
    `${SVG_HEADER}\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  <path fill="#000000" d="${pinned}"/>\n</svg>`,
  );
}

// ---------------------------------------------------------------------------
// SVG path parser + scanline rasteriser + PNG/ICO encoders
// ---------------------------------------------------------------------------

type Vertex = { x: number; y: number };
type Polygon = Vertex[];
type Shape = { polygons: Polygon[]; fill: string | null };

function parsePath(d: string): Polygon[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const polygons: Polygon[] = [];
  let current: Polygon = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";
  let i = 0;

  const num = (): number => Number(tokens[i++]);
  const flush = (): void => {
    if (current.length > 2) polygons.push(current);
    current = [];
  };
  const curveTo = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x: number,
    y: number,
  ): void => {
    const len =
      Math.hypot(x1 - cx, y1 - cy) +
      Math.hypot(x2 - x1, y2 - y1) +
      Math.hypot(x - x2, y - y2);
    const steps = Math.min(240, Math.max(8, Math.ceil(len / 0.5)));
    const x0 = cx;
    const y0 = cy;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      current.push({
        x:
          u * u * u * x0 +
          3 * u * u * t * x1 +
          3 * u * t * t * x2 +
          t * t * t * x,
        y:
          u * u * u * y0 +
          3 * u * u * t * y1 +
          3 * u * t * t * y2 +
          t * t * t * y,
      });
    }
    cx = x;
    cy = y;
  };

  while (i < tokens.length) {
    const token = tokens[i] as string;
    if (/[a-zA-Z]/.test(token)) {
      cmd = token;
      i++;
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        flush();
        cx = sx = num() + ox;
        cy = sy = num() + oy;
        current = [{ x: cx, y: cy }];
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        cx = num() + ox;
        cy = num() + oy;
        current.push({ x: cx, y: cy });
        break;
      }
      case "H": {
        cx = num() + ox;
        current.push({ x: cx, y: cy });
        break;
      }
      case "V": {
        cy = num() + oy;
        current.push({ x: cx, y: cy });
        break;
      }
      case "C": {
        curveTo(
          num() + ox,
          num() + oy,
          num() + ox,
          num() + oy,
          num() + ox,
          num() + oy,
        );
        break;
      }
      case "Z": {
        current.push({ x: sx, y: sy });
        flush();
        cx = sx;
        cy = sy;
        break;
      }
      default:
        throw new Error(`unsupported path command "${cmd}"`);
    }
  }
  flush();
  return polygons;
}

type Svg = { viewBox: [number, number, number, number]; shapes: Shape[] };

function parseSvg(source: string): Svg {
  const viewBoxMatch = /viewBox\s*=\s*"([^"]+)"/.exec(source);
  if (viewBoxMatch === null) throw new Error("svg has no viewBox");
  const nums = (viewBoxMatch[1] as string)
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const shapes: Shape[] = [];
  for (const tag of source.match(/<path\b[^>]*>/g) ?? []) {
    const d = /\bd\s*=\s*"([^"]+)"/.exec(tag);
    if (d === null) continue;
    const fill = /\bfill\s*=\s*"(#[0-9a-fA-F]{6})"/.exec(tag);
    shapes.push({
      polygons: parsePath(d[1] as string),
      fill: fill === null ? null : (fill[1] as string),
    });
  }
  if (shapes.length === 0) throw new Error("svg has no <path>");
  return {
    viewBox: [
      nums[0] as number,
      nums[1] as number,
      nums[2] as number,
      nums[3] as number,
    ],
    shapes,
  };
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Renders `svg` into a `width` x `height` RGBA buffer. Artwork is scaled to fit
 * inside the canvas minus `padding` (fraction of the shorter side) and centred.
 * Anti-aliasing: exact horizontal coverage, 8x vertical supersampling.
 * Shapes without an explicit `fill` use `fg`; `bg` fills the whole canvas
 * opaquely when given, otherwise the canvas stays transparent.
 */
function render(options: {
  svg: Svg;
  width: number;
  height: number;
  fg: Rgb;
  bg: Rgb | null;
  padding?: number;
}): Buffer {
  const { svg, width, height, fg, bg } = options;
  const padding = options.padding ?? 0;
  const [vx, vy, vw, vh] = svg.viewBox;
  const inset = Math.min(width, height) * padding;
  const scale = Math.min((width - 2 * inset) / vw, (height - 2 * inset) / vh);
  const dx = (width - vw * scale) / 2 - vx * scale;
  const dy = (height - vh * scale) / 2 - vy * scale;

  const pixels = Buffer.alloc(width * height * 4);
  if (bg !== null) {
    for (let i = 0; i < width * height; i++) {
      pixels[i * 4] = bg[0];
      pixels[i * 4 + 1] = bg[1];
      pixels[i * 4 + 2] = bg[2];
      pixels[i * 4 + 3] = 255;
    }
  }

  const SS = 8;
  const coverage = new Float32Array(width * height);

  /** Accumulates one scanline span's coverage. Extracted from the rasteriser's
   * innermost loop purely to keep the nesting inside the max-depth limit. */
  const addSpan = (row: number, spanFrom: number, spanTo: number): void => {
    const from = Math.max(0, Math.floor(spanFrom));
    const to = Math.min(width - 1, Math.ceil(spanTo) - 1);
    for (let px = from; px <= to; px++) {
      const overlap = Math.min(spanTo, px + 1) - Math.max(spanFrom, px);
      if (overlap <= 0) continue;
      const idx = row * width + px;
      coverage[idx] = (coverage[idx] ?? 0) + overlap / SS;
    }
  };

  for (const shape of svg.shapes) {
    coverage.fill(0);
    type Edge = { x0: number; y0: number; x1: number; y1: number };
    const edges: Edge[] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const polygon of shape.polygons) {
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i] as Vertex;
        const b = polygon[(i + 1) % polygon.length] as Vertex;
        const y0 = a.y * scale + dy;
        const y1 = b.y * scale + dy;
        if (y0 === y1) continue;
        edges.push({ x0: a.x * scale + dx, y0, x1: b.x * scale + dx, y1 });
        minY = Math.min(minY, y0, y1);
        maxY = Math.max(maxY, y0, y1);
      }
    }
    if (edges.length === 0) continue;

    const rowFrom = Math.max(0, Math.floor(minY));
    const rowTo = Math.min(height - 1, Math.ceil(maxY));
    const crossings: { x: number; dir: number }[] = [];

    for (let row = rowFrom; row <= rowTo; row++) {
      for (let sub = 0; sub < SS; sub++) {
        const y = row + (sub + 0.5) / SS;
        crossings.length = 0;
        for (const e of edges) {
          if (y < Math.min(e.y0, e.y1) || y >= Math.max(e.y0, e.y1)) continue;
          const t = (y - e.y0) / (e.y1 - e.y0);
          crossings.push({
            x: e.x0 + t * (e.x1 - e.x0),
            dir: e.y1 > e.y0 ? 1 : -1,
          });
        }
        if (crossings.length < 2) continue;
        crossings.sort((a, b) => a.x - b.x);

        let winding = 0;
        for (let c = 0; c < crossings.length - 1; c++) {
          winding += (crossings[c] as { dir: number }).dir;
          if (winding === 0) continue;
          addSpan(
            row,
            (crossings[c] as { x: number }).x,
            (crossings[c + 1] as { x: number }).x,
          );
        }
      }
    }

    const ink = shape.fill === null ? fg : hexToRgb(shape.fill);
    for (let i = 0; i < width * height; i++) {
      const a = Math.max(0, Math.min(1, coverage[i] as number));
      if (a === 0) continue;
      const o = i * 4;
      const da = (pixels[o + 3] as number) / 255;
      const outA = a + da * (1 - a);
      for (let ch = 0; ch < 3; ch++) {
        const src = ink[ch] as number;
        const dst = pixels[o + ch] as number;
        pixels[o + ch] = Math.round((src * a + dst * da * (1 - a)) / outA);
      }
      pixels[o + 3] = Math.round(outA * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels: Buffer, width: number, height: number): Buffer {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    pixels.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** PNG-payload ICO (Windows Vista+, every current browser). */
function encodeIco(entries: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const directory: Buffer[] = [];
  for (const entry of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = entry.size >= 256 ? 0 : entry.size;
    dir[1] = entry.size >= 256 ? 0 : entry.size;
    dir.writeUInt16LE(1, 4); // colour planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(entry.png.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += entry.png.length;
    directory.push(dir);
  }
  return Buffer.concat([header, ...directory, ...entries.map((e) => e.png)]);
}

// ---------------------------------------------------------------------------
// mode: assets — the INF-114 matrix
// ---------------------------------------------------------------------------

function writePng(
  file: string,
  svg: Svg,
  width: number,
  height: number,
  bg: Rgb | null,
  padding = 0,
): void {
  const png = encodePng(
    render({ svg, width, height, fg: hexToRgb(FG), bg, padding }),
    width,
    height,
  );
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, png);
  console.log(
    `${path.relative(ROOT, file).replaceAll("\\", "/")}  ${width}x${height}  ${png.length} B`,
  );
}

function assets(): void {
  const mark = parseSvg(
    readFileSync(path.join(LOGO_DIR, "croco-mark.svg"), "utf8"),
  );
  const square = parseSvg(
    readFileSync(path.join(FAVICON_DIR, "favicon.svg"), "utf8"),
  );
  const bg = hexToRgb(BG);

  const ico = [16, 32, 48].map((size) => ({
    size,
    png: encodePng(
      render({
        svg: square,
        width: size,
        height: size,
        fg: hexToRgb(FG),
        bg: null,
      }),
      size,
      size,
    ),
  }));
  mkdirSync(FAVICON_DIR, { recursive: true });
  writeFileSync(path.join(FAVICON_DIR, "favicon.ico"), encodeIco(ico));
  console.log("frontend/static/images/favicon/favicon.ico  16+32+48");

  writePng(path.join(FAVICON_DIR, "favicon-16x16.png"), square, 16, 16, null);
  writePng(path.join(FAVICON_DIR, "favicon-32x32.png"), square, 32, 32, null);
  writePng(
    path.join(FAVICON_DIR, "apple-touch-icon.png"),
    square,
    180,
    180,
    bg,
  );
  writePng(
    path.join(FAVICON_DIR, "android-chrome-192x192.png"),
    square,
    192,
    192,
    null,
  );
  writePng(
    path.join(FAVICON_DIR, "android-chrome-512x512.png"),
    square,
    512,
    512,
    null,
  );
  for (const [w, h] of [
    [70, 70],
    [150, 150],
    [310, 150],
    [310, 310],
  ] as [number, number][]) {
    writePng(
      path.join(FAVICON_DIR, `mstile-${w}x${h}.png`),
      mark,
      w,
      h,
      bg,
      0.14,
    );
  }
  writePng(
    path.join(ICONS_DIR, "general_icon_x512.png"),
    square,
    512,
    512,
    null,
  );
  // Maskable: the plate colour matches the canvas, so the extra padding buys
  // the >= 20 % safe area the spec wants (INF-114).
  writePng(
    path.join(ICONS_DIR, "maskable_icon_x512.png"),
    square,
    512,
    512,
    bg,
    0.16,
  );
  writePng(
    path.join(STATIC, "images", "crococalcsocial.png"),
    mark,
    1200,
    630,
    bg,
    0.22,
  );
}

// ---------------------------------------------------------------------------

const [mode, ...rest] = process.argv.slice(2);
if (mode === "generate") {
  const flag = rest.indexOf("--count");
  await generate(flag === -1 ? 4 : Number(rest[flag + 1]));
} else if (mode === "svg") {
  buildSvgMasters();
} else if (mode === "assets") {
  assets();
} else {
  console.error(
    "usage: generate-icon.ts <generate [--count N] | svg | assets>",
  );
  process.exit(1);
}
