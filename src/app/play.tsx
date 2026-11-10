import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import PlayScreen from "@/components/play/PlayScreen";
import {
  chapterName,
  generateLevel,
  generateToday,
  generateZen,
  hashSeed,
  puzzleFromColors,
  resampleColors,
  type Puzzle,
  type ZenSize,
  type ZenSubtlety,
} from "@/engine";
import { useProfile } from "@/state/profile";
import { CANONICAL_COLS, CANONICAL_ROWS, useStudio } from "@/state/studio";
import { palette, type as typeScale } from "@/theme";

interface RouteInfo {
  puzzle: Puzzle;
  title: string;
  subtitle: string;
  level?: number;
  size?: ZenSize;
  subtlety?: ZenSubtlety;
  studioId?: string;
  grid?: string;
  missing?: boolean;
}

export default function PlayRoute() {
  const params = useLocalSearchParams<{
    mode: string;
    n?: string;
    v?: string;
    id?: string;
    cols?: string;
    rows?: string;
    size?: string;
    subtlety?: string;
  }>();

  const worldSeed = useProfile((s) => s.worldSeed);
  const mode = params.mode ?? "level";

  const info: RouteInfo = useMemo(() => {
    if (mode === "today") {
      const dateISO = new Date().toISOString().slice(0, 10);
      return {
        puzzle: generateToday(dateISO, worldSeed),
        title: "TODAY",
        subtitle: "a gradient for everyone",
      };
    }
    if (mode === "zen") {
      const zSize = (params.size as ZenSize) ?? "medium";
      const zSub = (params.subtlety as ZenSubtlety) ?? "subtle";
      const nonce = Number(params.v ?? 0);
      return {
        puzzle: generateZen(nonce, { size: zSize, subtlety: zSub }, worldSeed),
        title: "ZEN",
        subtitle: `${zSize} · ${zSub}`,
        size: zSize,
        subtlety: zSub,
      };
    }
    if (mode === "studio" && params.id) {
      const gradient = useStudio.getState().gradients.find((g) => g.id === params.id);
      if (!gradient) {
        return { puzzle: generateZen(0), title: "—", subtitle: "", missing: true };
      }
      const cols = Math.min(12, Math.max(3, Number(params.cols ?? 7)));
      const rows = Math.min(14, Math.max(3, Number(params.rows ?? 9)));
      const colors = resampleColors(
        gradient.canonical,
        CANONICAL_COLS,
        CANONICAL_ROWS,
        cols,
        rows,
      );
      return {
        puzzle: puzzleFromColors(colors, cols, rows, hashSeed("studio", gradient.id, cols, rows, worldSeed)),
        title: gradient.name.toUpperCase().slice(0, 22),
        subtitle: `studio · ${cols}×${rows}`,
        studioId: gradient.id,
        grid: `${cols}x${rows}`,
      };
    }
    const n = Math.max(1, Number(params.n ?? 1));
    return {
      puzzle: generateLevel(n, worldSeed),
      title: chapterName(n),
      subtitle: `level ${n}`,
      level: n,
    };
  }, [mode, params.n, params.v, params.id, params.cols, params.rows, params.size, params.subtlety, worldSeed]);

  if (info.missing) {
    return (
      <View style={missingStyles.center}>
        <Text style={missingStyles.text}>this gradient is no longer in the library</Text>
        <Pressable onPress={() => router.replace("/")}>
          <Text style={missingStyles.link}>home</Text>
        </Pressable>
      </View>
    );
  }

  const onNext = () => {
    if (mode === "level" && info.level !== undefined) {
      router.replace({
        pathname: "/play",
        params: { mode: "level", n: String(info.level + 1) },
      });
    } else if (mode === "zen") {
      const nonce = useProfile.getState().nextZenNonce();
      router.replace({
        pathname: "/play",
        params: {
          mode: "zen",
          v: String(nonce),
          size: params.size ?? "medium",
          subtlety: params.subtlety ?? "subtle",
        },
      });
    } else {
      router.back();
    }
  };

  return (
    <PlayScreen
      puzzle={info.puzzle}
      kind={mode as "level" | "today" | "zen" | "studio"}
      level={info.level}
      size={info.size}
      subtlety={info.subtlety}
      studioId={info.studioId}
      grid={info.grid}
      title={info.title}
      subtitle={info.subtitle}
      onNext={onNext}
      onExit={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}

const missingStyles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: palette.bgPlay,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  text: { ...typeScale.body, color: palette.textDim, textAlign: "center" },
  link: { ...typeScale.label, color: palette.accent },
});
