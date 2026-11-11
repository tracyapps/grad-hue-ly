/**
 * The play route. Every mode builds a puzzle from URL params, then tells the
 * PlayScreen how to keep the player playing: the next board, a surprise,
 * and how to change the board size — so nobody has to go back to a menu
 * to decide what's next.
 *
 *   /play?mode=level&n=12                 journey (size from settings)
 *   /play?mode=today
 *   /play?mode=endless&v=3&cols=9&rows=12&sub=subtle
 *   /play?mode=studio&id=…&cols=7&rows=9    your own Studio gradient
 *   /play?mode=community&id=…&cols=7&rows=9 a community board
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import PlayScreen, { type PlayAction, type ResizeOption } from "@/components/play/PlayScreen";
import type { BoardChoice } from "@/components/BoardPicker";
import {
  SIZE_PRESETS,
  chapterName,
  clampSize,
  generateEndless,
  generateLevel,
  generateToday,
  generateZen,
  hashSeed,
  puzzleFromField,
  quantizeField,
  type Puzzle,
  type ZenSize,
  type ZenSubtlety,
} from "@/engine";
import { gridKey, useProfile } from "@/state/profile";
import { gradientField, useStudio, type BoardSource } from "@/state/studio";
import { useCommunity, type CommunityBoard } from "@/sync/community";
import { palette, type as typeScale } from "@/theme";

type Params = {
  mode?: string;
  n?: string;
  v?: string;
  id?: string;
  cols?: string;
  rows?: string;
  sub?: string;
  size?: string;
  subtlety?: string;
};

const num = (s: string | undefined, d: number) => (s && !Number.isNaN(Number(s)) ? Number(s) : d);
const SUBS: ZenSubtlety[] = ["gentle", "subtle", "ethereal"];
const asSub = (s: string | undefined): ZenSubtlety =>
  SUBS.includes(s as ZenSubtlety) ? (s as ZenSubtlety) : "subtle";

function go(params: Record<string, string>) {
  router.replace({ pathname: "/play", params });
}

/** A board's field at a size, as hex colors — for previews and play. */
function boardColors(src: BoardSource, cols: number, rows: number): string[] {
  return quantizeField(gradientField(src, cols, rows), cols, rows);
}

export default function PlayRoute() {
  const p = useLocalSearchParams<Params>();
  const mode = p.mode === "zen" && p.cols ? "endless" : (p.mode ?? "level");
  const worldSeed = useProfile((s) => s.worldSeed);
  const settings = useProfile((s) => s.settings);
  const updateSettings = useProfile((s) => s.updateSettings);
  const nextNonce = useProfile((s) => s.nextZenNonce);
  const studio = useStudio((s) => s.gradients);
  const exit = useCallback(() => (router.canGoBack() ? router.back() : router.replace("/")), []);

  // Community boards may need a network fetch (deep links, "next" pages).
  const [remote, setRemote] = useState<CommunityBoard | null | "loading">(
    mode === "community" ? "loading" : null,
  );
  useEffect(() => {
    if (mode !== "community" || !p.id) return;
    let live = true;
    setRemote("loading");
    void useCommunity
      .getState()
      .get(p.id)
      .then((b) => live && setRemote(b));
    return () => {
      live = false;
    };
  }, [mode, p.id]);

  const cols = num(p.cols, 7);
  const rows = num(p.rows, 9);

  // ---------------------------------------------------------------- level
  if (mode === "level") {
    const n = Math.max(1, num(p.n, 1));
    const fixed = settings.journeySize.mode === "fixed" ? settings.journeySize : undefined;
    return (
      <LevelPlay
        key={`level-${n}-${fixed ? gridKey(fixed.cols, fixed.rows) : "grow"}`}
        n={n}
        worldSeed={worldSeed}
        fixed={fixed}
        onResize={(c) => {
          updateSettings({ journeySize: { mode: "fixed", cols: c.cols, rows: c.rows } });
        }}
        onGrow={() => updateSettings({ journeySize: { ...settings.journeySize, mode: "grow" } })}
        exit={exit}
      />
    );
  }

  // ---------------------------------------------------------------- today
  if (mode === "today") {
    const dateISO = new Date().toISOString().slice(0, 10);
    return (
      <PlayScreen
        puzzle={generateToday(dateISO, worldSeed)}
        kind="today"
        title="TODAY"
        subtitle="a gradient for everyone"
        next={{ label: "keep playing", onPress: () => goEndless(settings.endless) }}
        surprise={{ label: "surprise me", onPress: () => goEndless(randomChoice()) }}
        onExit={exit}
      />
    );
  }

  // ---------------------------------------------------------------- endless
  function goEndless(c: BoardChoice) {
    const nonce = nextNonce();
    go({
      mode: "endless",
      v: String(nonce),
      cols: String(c.cols),
      rows: String(c.rows),
      sub: c.subtlety ?? "subtle",
    });
  }

  if (mode === "endless" || mode === "zen") {
    // Legacy zen links (size names) still work.
    if (mode === "zen" && !p.cols) {
      const zSize = (p.size as ZenSize) ?? "medium";
      const zSub = asSub(p.subtlety);
      const nonce = num(p.v, 0);
      return (
        <PlayScreen
          key={`zen-${nonce}`}
          puzzle={generateZen(nonce, { size: zSize, subtlety: zSub }, worldSeed)}
          kind="zen"
          size={zSize}
          subtlety={zSub}
          zenNonce={nonce}
          title="ENDLESS"
          subtitle={`${zSize} · ${zSub}`}
          next={{ label: "another", onPress: () => goEndless(settings.endless) }}
          onExit={exit}
        />
      );
    }
    const sub = asSub(p.sub);
    const [c, r] = clampSize(cols, rows);
    const nonce = num(p.v, 0);
    const current: BoardChoice = { cols: c, rows: r, subtlety: sub };
    return (
      <PlayScreen
        key={`endless-${nonce}-${c}x${r}-${sub}`}
        puzzle={generateEndless(nonce, c, r, sub, worldSeed)}
        kind="zen"
        subtlety={sub}
        grid={gridKey(c, r)}
        zenNonce={nonce}
        title="ENDLESS"
        subtitle={`${c}×${r} · ${sub === "gentle" ? "clear" : sub === "subtle" ? "soft" : "whisper"}`}
        next={{ label: "another", onPress: () => goEndless(current) }}
        surprise={{ label: "surprise me", onPress: () => goEndless(randomChoice(current)) }}
        resize={{
          value: current,
          showSubtlety: true,
          preview: (ch) => ({
            colors: generateEndless(nonce, ch.cols, ch.rows, ch.subtlety ?? sub, worldSeed).colors,
            cols: ch.cols,
            rows: ch.rows,
          }),
          apply: (ch) => {
            updateSettings({ endless: { cols: ch.cols, rows: ch.rows, subtlety: ch.subtlety ?? sub } });
            go({ mode: "endless", v: String(nonce), cols: String(ch.cols), rows: String(ch.rows), sub: ch.subtlety ?? sub });
          },
        }}
        onExit={exit}
      />
    );
  }

  // ---------------------------------------------------------------- boards
  const isCommunity = mode === "community";
  const source: (BoardSource & { id: string; name: string; author?: string }) | null = isCommunity
    ? remote && remote !== "loading"
      ? { ...remote }
      : null
    : (studio.find((g) => g.id === p.id) ?? null);

  if (isCommunity && remote === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.textDim} />
      </View>
    );
  }
  if (!source) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>this board isn't available any more</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(isCommunity ? "/community" : "/studio")}>
          <Text style={styles.link}>{isCommunity ? "back to the community" : "back to the studio"}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <BoardPlay
      key={`${mode}-${source.id}-${cols}x${rows}`}
      mode={isCommunity ? "community" : "studio"}
      source={source}
      cols={clampSize(cols, rows)[0]}
      rows={clampSize(cols, rows)[1]}
      worldSeed={worldSeed}
      exit={exit}
    />
  );
}

/** A random, comfortable endless choice (never the huge sizes). */
function randomChoice(avoid?: BoardChoice): BoardChoice {
  const pool = SIZE_PRESETS.filter(([c, r]) => c * r <= 140);
  for (let i = 0; i < 8; i++) {
    const [c, r] = pool[Math.floor(Math.random() * pool.length)];
    const subtlety = SUBS[Math.floor(Math.random() * SUBS.length)];
    if (!avoid || avoid.cols !== c || avoid.subtlety !== subtlety) return { cols: c, rows: r, subtlety };
  }
  return { cols: 7, rows: 9, subtlety: "subtle" };
}

function LevelPlay({
  n,
  worldSeed,
  fixed,
  onResize,
  onGrow,
  exit,
}: {
  n: number;
  worldSeed: number;
  fixed?: { cols: number; rows: number };
  onResize: (c: BoardChoice) => void;
  onGrow: () => void;
  exit: () => void;
}) {
  const puzzle = useMemo(() => generateLevel(n, worldSeed, fixed), [n, worldSeed, fixed]);
  const resize: ResizeOption = {
    value: { cols: puzzle.cols, rows: puzzle.rows },
    showSubtlety: false,
    preview: (c) => {
      const pz = generateLevel(n, worldSeed, { cols: c.cols, rows: c.rows });
      return { colors: pz.colors, cols: pz.cols, rows: pz.rows };
    },
    apply: onResize,
  };
  return (
    <PlayScreen
      puzzle={puzzle}
      kind="level"
      level={n}
      grid={fixed ? gridKey(puzzle.cols, puzzle.rows) : undefined}
      title={chapterName(n)}
      subtitle={`level ${n}${fixed ? ` · ${puzzle.cols}×${puzzle.rows}` : ""}`}
      next={{ label: "next level", onPress: () => go({ mode: "level", n: String(n + 1) }) }}
      surprise={fixed ? { label: "let boards grow", onPress: () => { onGrow(); go({ mode: "level", n: String(n + 1) }); } } : undefined}
      resize={resize}
      onExit={exit}
    />
  );
}

function BoardPlay({
  mode,
  source,
  cols,
  rows,
  worldSeed,
  exit,
}: {
  mode: "studio" | "community";
  source: BoardSource & { id: string; name: string; author?: string };
  cols: number;
  rows: number;
  worldSeed: number;
  exit: () => void;
}) {
  const puzzle: Puzzle = useMemo(
    () =>
      puzzleFromField(
        gradientField(source, cols, rows),
        cols,
        rows,
        hashSeed(mode, source.id, cols, rows, worldSeed),
      ),
    [mode, source, cols, rows, worldSeed],
  );

  const playBoard = (id: string, c = cols, r = rows) =>
    go({ mode, id, cols: String(c), rows: String(r) });

  const next: PlayAction =
    mode === "community"
      ? {
          label: "next board",
          onPress: () =>
            void useCommunity
              .getState()
              .after(source.id)
              .then((b) => (b ? playBoard(b.id) : router.replace("/community"))),
        }
      : {
          label: "next gradient",
          onPress: () => {
            const lib = useStudio.getState().gradients;
            const i = lib.findIndex((g) => g.id === source.id);
            const nxt = lib[(i + 1) % Math.max(1, lib.length)];
            if (nxt) playBoard(nxt.id);
          },
        };

  const surprise: PlayAction = {
    label: "surprise me",
    onPress: () => {
      if (mode === "community") {
        const b = useCommunity.getState().random(source.id);
        if (b) playBoard(b.id);
        else router.replace("/community");
      } else {
        const lib = useStudio.getState().gradients.filter((g) => g.id !== source.id);
        const g = lib[Math.floor(Math.random() * lib.length)];
        if (g) playBoard(g.id);
      }
    },
  };

  return (
    <PlayScreen
      puzzle={puzzle}
      kind={mode}
      studioId={mode === "studio" ? source.id : undefined}
      boardId={mode === "community" ? source.id : undefined}
      boardName={source.name}
      grid={gridKey(cols, rows)}
      title={source.name.toUpperCase().slice(0, 26)}
      subtitle={`${source.author ? `@${source.author} · ` : ""}${cols}×${rows}`}
      next={next}
      surprise={surprise}
      resize={{
        value: { cols, rows },
        showSubtlety: false,
        preview: (c) => ({ colors: boardColors(source, c.cols, c.rows), cols: c.cols, rows: c.rows }),
        apply: (c) => playBoard(source.id, c.cols, c.rows),
      }}
      onSolved={mode === "community" ? () => useCommunity.getState().countSolve(source.id) : undefined}
      onExit={exit}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: palette.bgPlay,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  text: { ...typeScale.body, color: palette.textDim, textAlign: "center" },
  link: { ...typeScale.label, color: palette.accent },
});
