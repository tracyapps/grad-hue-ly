# grad[hue]ly

Endless, zen gradient puzzles — Expo (web + iOS + Android).

```bash
npm install
npx expo start          # dev server (press w for web)
npm test                # engine invariants (vitest)
npx tsc --noEmit        # typecheck
npx tsx scripts/audit/audit.ts 600   # gradient quality report, levels 1–600
```

## How a board is made (src/engine)

- **field.ts** — every board is a smooth surface in OKLab: two *orthogonal*
  flows (a hue arc or straight sweep, and a lightness/chroma ramp) plus an
  optional twist perpendicular to both. Steps are constant along every row and
  column, two tiles in different places can never look alike, and the whole
  surface is checked against the sRGB gamut before it's accepted — nothing is
  clamped, so nothing kinks.
- **quantize.ts** — picks each tile's 8-bit color to preserve the *differences*
  between neighbors, not just each color on its own.
- **difficulty.ts** — the curve: a 17-rung size ladder (4×4 → 10×14) and a step
  size in ΔE_OK2 that never drops below `MIN_STEP` (0.036).
- **palettes.ts** — one color mood per chapter.

`fieldQuality()` reports evenness, kinks ("jumps") and twins (ambiguity); the
tests run it over levels 1–400 and several worlds.

## Playing

Drag a tile onto another, **or** tap two tiles, **or** (web) use the arrow keys
and Space/Enter. Escape puts a picked-up tile back.
