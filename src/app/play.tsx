import { useMemo } from "react";
import { router, useLocalSearchParams } from "expo-router";
import PlayScreen from "@/components/play/PlayScreen";
import {
  chapterName,
  generateLevel,
  generateToday,
  generateZen,
  type ZenSize,
  type ZenSubtlety,
} from "@/engine";
import { useProfile } from "@/state/profile";

export default function PlayRoute() {
  const params = useLocalSearchParams<{
    mode: string;
    n?: string;
    v?: string;
    size?: string;
    subtlety?: string;
  }>();

  const worldSeed = useProfile((s) => s.worldSeed);
  const mode = params.mode ?? "level";

  const { puzzle, title, subtitle, level, size, subtlety } = useMemo(() => {
    if (mode === "today") {
      const dateISO = new Date().toISOString().slice(0, 10);
      return {
        puzzle: generateToday(dateISO, worldSeed),
        title: "TODAY",
        subtitle: "a gradient for everyone",
        level: undefined as number | undefined,
        size: undefined,
        subtlety: undefined,
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
        level: undefined as number | undefined,
        size: zSize,
        subtlety: zSub,
      };
    }
    const n = Math.max(1, Number(params.n ?? 1));
    return {
      puzzle: generateLevel(n, worldSeed),
      title: chapterName(n),
      subtitle: `level ${n}`,
      level: n,
      size: undefined,
      subtlety: undefined,
    };
  }, [mode, params.n, params.v, params.size, params.subtlety, worldSeed]);

  const onNext = () => {
    if (mode === "level" && level !== undefined) {
      router.replace({
        pathname: "/play",
        params: { mode: "level", n: String(level + 1) },
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
      puzzle={puzzle}
      kind={mode as "level" | "today" | "zen"}
      level={level}
      size={size}
      subtlety={subtlety}
      title={title}
      subtitle={subtitle}
      onNext={onNext}
      onExit={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}
