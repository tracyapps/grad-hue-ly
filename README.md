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

## Playing modes

- **Journey** — numbered levels with chapter color moods. Boards grow with the
  levels, or pick a fixed size from the home card ("9×12 · your size").
- **Endless** — your size (3–14 × 3–20) and contrast, new colors forever.
- **Community** — boards made in the Studio and shared by players (@name).
  Pick a board, choose its size, play; "next board" / "surprise me" keep you going.
- **Today** — one shared board per day.

## Backend (Vercel functions + Neon)

| route | what |
| --- | --- |
| `GET/PUT /api/profile` | one JSON progress snapshot per player (sync) |
| `GET/PUT /api/me` | your public @name |
| `GET/POST/DELETE /api/boards` | community boards (list new/popular, share, delete; admins hide) |
| `POST /api/board-solve` | count a solve |

Auth is Neon Auth (email codes); every authed route verifies the JWT against
the project's JWKS. SQL lives in `db/migrations/` — run them in order.

Env vars (Vercel): `DATABASE_URL` (from the Neon integration),
`NEON_AUTH_BASE_URL`, `EXPO_PUBLIC_NEON_AUTH_URL` (same URL, exposed to the web
build — accounts stay hidden until it's set), optional `ADMIN_USER_IDS`
(comma-separated auth user ids allowed to hide community boards).

Local end-to-end test with real API handlers, in-memory Postgres and a fake auth:

```bash
EXPO_PUBLIC_NEON_AUTH_URL=http://localhost:8090/auth npx expo export -p web -o dist-e2e
npx tsx scripts/e2e/integration-server.mts dist-e2e &
node scripts/e2e/community-flow.mjs
```

## Controls

Drag a tile onto another, **or** tap two tiles, **or** (web) use the arrow keys
and Space/Enter. Escape puts a picked-up tile back.
