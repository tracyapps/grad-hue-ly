/**
 * Gradient terrain — the living menu backdrop (web).
 *
 * An engraved landscape of stacked contour lines, colored by a real
 * grad[hue]ly board, flowing slowly toward you. Everything reacts to the
 * player:
 *   • the land rises under the pointer and its true colors bloom there
 *     (elsewhere the lines stay quiet and engraved);
 *   • a soft glow of the pointer's color follows, a beat behind;
 *   • a click or tap sends a ripple rolling out through the hills;
 *   • left alone, an invisible "ghost" pointer wanders on its own.
 *
 * Plain 2D canvas, no libraries. Budgeted: device-pixel ratio capped at 1.5,
 * fewer lines on small screens, automatic quality step-down if frames run
 * slow, a hard stop when the tab is hidden or the screen loses focus, and a
 * single still frame for reduce-motion.
 */

// ------------------------------------------------------------------ noise

/** Compact 2D simplex noise (Gustavson), seeded. Returns roughly [-1, 1]. */
function makeNoise(seed: number) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0 || 1;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [
    [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  return (xin: number, yin: number): number => {
    const sk = (xin + yin) * F2;
    const i = Math.floor(xin + sk);
    const j = Math.floor(yin + sk);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = G[perm[ii + perm[jj]] & 7];
      t0 *= t0;
      n += t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = G[perm[ii + i1 + perm[jj + j1]] & 7];
      t1 *= t1;
      n += t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = G[perm[ii + 1 + perm[jj + 1]] & 7];
      t2 *= t2;
      n += t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * n;
  };
}

// ------------------------------------------------------------------ color

export type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** A board's solved colors as a bilinearly sampled 2D palette. */
export interface PaletteGrid {
  colors: string[];
  cols: number;
  rows: number;
}

function paletteSampler(grid: PaletteGrid) {
  const rgb = grid.colors.map(hexToRgb);
  const { cols, rows } = grid;
  return (u: number, v: number): RGB => {
    const fx = Math.min(1, Math.max(0, u)) * (cols - 1);
    const fy = Math.min(1, Math.max(0, v)) * (rows - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(cols - 1, x0 + 1);
    const y1 = Math.min(rows - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = rgb[y0 * cols + x0];
    const b = rgb[y0 * cols + x1];
    const c = rgb[y1 * cols + x0];
    const d = rgb[y1 * cols + x1];
    const out: RGB = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const top = a[k] + (b[k] - a[k]) * tx;
      const bot = c[k] + (d[k] - c[k]) * tx;
      out[k] = top + (bot - top) * ty;
    }
    return out;
  };
}

/** A soft default when no board is supplied (dusk teal → plum → ember). */
export const DEFAULT_PALETTE: PaletteGrid = {
  cols: 2,
  rows: 2,
  colors: ["#5fb3c2", "#a78bd8", "#8a6fd1", "#e0907a"],
};

// ------------------------------------------------------------------ engine

export interface TerrainOptions {
  /** "hero" = the full show (home); "ambient" = a quieter strip (menus). */
  variant: "hero" | "ambient";
  /** Background the canvas paints first (matches the app's menu color). */
  background: string;
  seed?: number;
}

interface Ripple {
  x: number;
  y: number;
  t0: number;
}

export class Terrain {
  private ctx: CanvasRenderingContext2D;
  private noise: (x: number, y: number) => number;
  private sample: (u: number, v: number) => RGB;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private raf = 0;
  private running = false;
  private start = 0;
  private quality = 1; // 1 → full, steps down to 0.55 on slow devices
  private frameTimes: number[] = [];
  // pointer: target (raw), current (smoothed), glow (slower)
  private target = { x: 0.5, y: 0.62, active: false, last: 0 };
  private cur = { x: 0.5, y: 0.62 };
  private glow = { x: 0.5, y: 0.62 };
  private ripples: Ripple[] = [];
  private bg: RGB;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: TerrainOptions,
    palette: PaletteGrid = DEFAULT_PALETTE,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d canvas unavailable");
    this.ctx = ctx;
    this.noise = makeNoise(opts.seed ?? 7);
    this.sample = paletteSampler(palette);
    this.bg = hexToRgb(opts.background);
    this.start = performance.now();
  }

  setPalette(palette: PaletteGrid) {
    this.sample = paletteSampler(palette);
    if (!this.running) this.draw(performance.now());
  }

  resize(width: number, height: number) {
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.W = Math.max(1, Math.round(width * this.dpr));
    this.H = Math.max(1, Math.round(height * this.dpr));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    if (!this.running) this.draw(performance.now());
  }

  /** Pointer in canvas CSS pixels. */
  pointer(x: number, y: number) {
    this.target.x = (x * this.dpr) / this.W;
    this.target.y = (y * this.dpr) / this.H;
    this.target.active = true;
    this.target.last = performance.now();
  }

  ripple(x: number, y: number) {
    this.ripples.push({ x: (x * this.dpr) / this.W, y: (y * this.dpr) / this.H, t0: performance.now() });
    if (this.ripples.length > 4) this.ripples.shift();
    this.pointer(x, y);
  }

  play() {
    if (this.running) return;
    this.running = true;
    let last = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      if (last) this.budget(now - last);
      last = now;
      this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Render one still frame (reduce motion). */
  still() {
    this.pause();
    this.draw(this.start + 12000);
  }

  /**
   * Adaptive quality from the real frame interval (includes rasterization,
   * not just our JS): below ~45 fps, draw fewer lines; recover slowly.
   */
  private budget(interval: number) {
    if (interval > 250) return; // tab was asleep; ignore
    this.frameTimes.push(interval);
    if (this.frameTimes.length < 45) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.frameTimes = [];
    if (median > 22 && this.quality > 0.5) this.quality = Math.max(0.5, this.quality - 0.15);
    else if (median < 17.5 && this.quality < 1) this.quality = Math.min(1, this.quality + 0.05);
  }

  private draw(now: number) {
    const { ctx, W, H } = this;
    if (W < 2 || H < 2) return;
    const hero = this.opts.variant === "hero";
    const t = (now - this.start) / 1000;

    // ---- pointer easing (+ the wandering ghost when idle)
    const idle = !this.target.active || now - this.target.last > 3500;
    const tx = idle ? 0.5 + 0.34 * Math.sin(t * 0.13) * Math.cos(t * 0.05) : this.target.x;
    const ty = idle ? 0.62 + 0.14 * Math.sin(t * 0.09 + 1.3) : this.target.y;
    this.cur.x += (tx - this.cur.x) * 0.09;
    this.cur.y += (ty - this.cur.y) * 0.09;
    this.glow.x += (tx - this.glow.x) * 0.035;
    this.glow.y += (ty - this.glow.y) * 0.035;

    // ---- background + drifting palette washes
    const [br, bgc, bb] = this.bg;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgb(${br},${bgc},${bb})`;
    ctx.fillRect(0, 0, W, H);
    const wash = (u: number, v: number, cx: number, cy: number, r: number, a: number) => {
      const [cr, cg, cb] = this.sample(u, v);
      const g = ctx.createRadialGradient(cx * W, cy * H, 0, cx * W, cy * H, r * Math.max(W, H));
      g.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},${a})`);
      g.addColorStop(1, `rgba(${cr | 0},${cg | 0},${cb | 0},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };
    wash(0.05, 0.1, 0.18 + 0.1 * Math.sin(t * 0.07), 0.22, 0.62, hero ? 0.3 : 0.18);
    wash(0.95, 0.9, 0.82 + 0.1 * Math.cos(t * 0.06), 0.3 + 0.1 * Math.sin(t * 0.05), 0.58, hero ? 0.28 : 0.16);

    // ---- terrain geometry
    const small = W / this.dpr < 640;
    const rowsN = Math.round((hero ? (small ? 46 : 70) : small ? 28 : 40) * this.quality);
    const ptsN = Math.round((hero ? (small ? 90 : 170) : small ? 70 : 120) * this.quality);
    const horizon = hero ? 0.36 : 0.58; // fraction of height
    const bottom = 1.04;
    const zNear = 1;
    const zFar = 7;
    const amp = (hero ? 0.34 : 0.16) * H;
    const flow = t * 0.11; // the land drifts toward you
    const px = this.cur.x;
    const py = this.cur.y;
    const now2 = now;
    const ripples = this.ripples.filter((r) => now2 - r.t0 < 5000);
    this.ripples = ripples;

    const xs = new Float32Array(ptsN);
    const ys = new Float32Array(ptsN);
    const lit = new Float32Array(ptsN);

    for (let r = 0; r < rowsN; r++) {
      // far → near so nearer ridges occlude farther ones
      const f = r / (rowsN - 1); // 0 far … 1 near
      // rows bunch toward the horizon, like real perspective
      const persp = Math.pow(f, 1.45); // 0…1 on screen
      const z = 1 / (1 / zFar + persp * (1 / zNear - 1 / zFar));
      const baseY = (horizon + (bottom - horizon) * persp) * H;
      const depthScale = 0.3 + 0.7 * persp;

      let minY = Infinity;
      for (let i = 0; i < ptsN; i++) {
        const xn = (i / (ptsN - 1)) * 2 - 1; // -1…1 across the screen
        const sx = ((xn + 1) / 2) * W;
        const wx = xn * z * 0.55;
        const wz = z * 0.55 - flow;
        // a central range with foothills, fBm detail
        const ex = xn - 0.12 * Math.sin(t * 0.03);
        const env = 0.12 + 0.88 * Math.exp(-ex * ex * 3.2);
        let h =
          (this.noise(wx * 0.9, wz * 0.9) * 0.6 +
            this.noise(wx * 2.1 + 9, wz * 2.1) * 0.28 +
            this.noise(wx * 4.7 - 3, wz * 4.7) * 0.12) *
            0.5 +
          0.5;
        h = Math.pow(Math.max(0, h), 1.35) * env * 1.25;

        // the pointer: land swells toward it, colors bloom around it
        const dx = sx / W - px;
        const dy = (baseY / H - py) * 1.5;
        const d2 = dx * dx + dy * dy;
        const near = Math.exp(-d2 / (hero ? 0.018 : 0.012));
        h += near * (hero ? 0.42 : 0.3) * (1 - 0.45 * persp);

        // ripples rolling out from taps
        for (const rp of ripples) {
          const age = (now2 - rp.t0) / 1000;
          const rx = sx / W - rp.x;
          const ry = (baseY / H - rp.y) * 1.5;
          const d = Math.sqrt(rx * rx + ry * ry);
          const front = age * 0.45;
          if (d < front) {
            h += 0.35 * Math.sin((d - front) * 38) * Math.exp(-d * 2.5) * Math.exp(-age * 1.1);
          }
        }

        const y = baseY - h * amp * depthScale;
        xs[i] = sx;
        ys[i] = y;
        lit[i] = near;
        if (y < minY) minY = y;
      }

      // occlusion: everything under this ridge is "land", slightly see-through
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let i = 1; i < ptsN; i++) ctx.lineTo(xs[i], ys[i]);
      // Everything farther sits above its own baseline, which is above ours,
      // so the occluder only needs to reach our baseline (cheap fill).
      const floor = baseY + amp * 0.08;
      ctx.lineTo(W, floor);
      ctx.lineTo(0, floor);
      ctx.closePath();
      ctx.fillStyle = `rgba(${br},${bgc},${bb},0.9)`;
      ctx.fill();

      // the line itself: palette color along its length, quiet far away,
      // vivid where the pointer is
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      const stops = 9;
      const v = 1 - f * 0.85; // far rows sample the top of the board
      const hueDrift = 0.06 * Math.sin(t * 0.05 + f * 2);
      const baseA = (hero ? 0.2 : 0.12) + (hero ? 0.42 : 0.3) * persp;
      // a slow band of light sweeping across the range
      const sweepAt = 0.5 + 0.62 * Math.sin(t * 0.085);
      for (let k = 0; k < stops; k++) {
        const u = k / (stops - 1);
        const idx = Math.min(ptsN - 1, Math.round(u * (ptsN - 1)));
        const [cr, cg, cb] = this.sample(u + hueDrift, v);
        // mix toward white-ish "engraving" when unlit
        const sweep = Math.exp(-((u - sweepAt) ** 2) / 0.012) * 0.35;
        const l = Math.min(1, lit[idx] * 1.7 + sweep);
        // quiet lines are pale "engravings" tinted by the board; lit lines
        // take the board's full color, a touch brightened
        const mix = 0.62 + 0.18 * persp + (0.38 - 0.18 * persp) * l;
        const lift = 38 * l;
        const er = Math.min(255, 215 + (cr - 215) * mix + lift);
        const eg = Math.min(255, 212 + (cg - 212) * mix + lift);
        const eb = Math.min(255, 225 + (cb - 225) * mix + lift);
        const a = Math.min(1, baseA + l * 0.8);
        grad.addColorStop(u, `rgba(${er | 0},${eg | 0},${eb | 0},${a.toFixed(3)})`);
      }
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let i = 1; i < ptsN; i++) ctx.lineTo(xs[i], ys[i]);
      ctx.strokeStyle = grad;
      ctx.lineWidth = (0.6 + 0.9 * persp) * this.dpr;
      ctx.stroke();
    }

    // ---- the pointer glow: a beat behind, in the color under it
    {
      const [cr, cg, cb] = this.sample(this.glow.x, 1 - Math.min(1, Math.max(0, (this.glow.y - horizon) / (1 - horizon))));
      const R = Math.max(W, H) * (hero ? 0.32 : 0.24);
      const g = ctx.createRadialGradient(this.glow.x * W, this.glow.y * H, 0, this.glow.x * W, this.glow.y * H, R);
      g.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},${hero ? 0.5 : 0.3})`);
      g.addColorStop(0.45, `rgba(${cr | 0},${cg | 0},${cb | 0},${hero ? 0.14 : 0.08})`);
      g.addColorStop(1, `rgba(${cr | 0},${cg | 0},${cb | 0},0)`);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }

    // ---- vignette keeps the UI the hero
    const vg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.25, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    vg.addColorStop(0, `rgba(${br},${bgc},${bb},0)`);
    vg.addColorStop(1, `rgba(${br},${bgc},${bb},0.7)`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}
