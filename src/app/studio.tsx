/**
 * The Studio — where you craft the game's content.
 *
 * Web-only for now (color pickers + image sampling need DOM tooling). Two
 * sources: four corner colors blended bilinearly in OKLab, or any smooth
 * gradient image sampled at tile centers. Everything is stored as a
 * canonical 12×18 color grid; previews show how it breaks into tiles at
 * each difficulty, and one tap plays it for real.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { createPortal } from "react-dom";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import { bilinearSample, hexToLab, labToHex, type Lab } from "@/engine";
import {
  CANONICAL_COLS,
  CANONICAL_ROWS,
  useStudio,
  type StudioGradient,
} from "@/state/studio";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

const GRID_PRESETS = [
  { label: "5 × 6", cols: 5, rows: 6 },
  { label: "7 × 9", cols: 7, rows: 9 },
  { label: "9 × 12", cols: 9, rows: 12 },
  { label: "10 × 14", cols: 10, rows: 14 },
] as const;

const DEFAULT_CORNERS: [string, string, string, string] = [
  "#E5B95C", // warm gold, TL
  "#B48CD9", // soft violet, TR
  "#7FB99B", // sage, BL
  "#4E6FB8", // dusk blue, BR
];

function cornersToCanonical(corners: string[]): string[] {
  const labs = corners.map(hexToLab) as [Lab, Lab, Lab, Lab];
  const out: string[] = [];
  for (let y = 0; y < CANONICAL_ROWS; y++) {
    for (let x = 0; x < CANONICAL_COLS; x++) {
      const u = x / (CANONICAL_COLS - 1);
      const v = y / (CANONICAL_ROWS - 1);
      out.push(labToHex(bilinearSample(labs, u, v)));
    }
  }
  return out;
}

function sampleImage(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const W = Math.min(img.width, 1024);
      const H = Math.round((img.height / img.width) * W);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("no 2d context"));
        return;
      }
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      const hex = (v: number) => v.toString(16).padStart(2, "0");
      const out: string[] = [];
      for (let y = 0; y < CANONICAL_ROWS; y++) {
        for (let x = 0; x < CANONICAL_COLS; x++) {
          const px = Math.min(W - 1, Math.floor(((x + 0.5) / CANONICAL_COLS) * W));
          const py = Math.min(H - 1, Math.floor(((y + 0.5) / CANONICAL_ROWS) * H));
          const i = (py * W + px) * 4;
          out.push(`#${hex(data[i])}${hex(data[i + 1])}${hex(data[i + 2])}`);
        }
      }
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image failed to load"));
    };
    img.src = url;
  });
}

/**
 * Portals raw DOM controls into a View that lives in the normal React Native
 * layout — the inputs render exactly where this component sits, clickable,
 * never trapped below the app.
 */
function PortalIntoView({ children }: { children: React.ReactNode }) {
  // Web-only escape hatch: the RN View's ref exposes the underlying DOM node.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hostRef = useRef<any>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = hostRef.current as HTMLElement | null;
    if (el && typeof el.appendChild === "function") setHost(el);
  }, []);

  return (
    <>
      <View ref={hostRef} collapsable={false} />
      {host ? createPortal(children, host) : null}
    </>
  );
}

function StudioForm({
  mode,
  name,
  onName,
  corners,
  onCorner,
  onImage,
}: {
  mode: "corners" | "image";
  name: string;
  onName: (v: string) => void;
  corners: string[];
  onCorner: (i: number, v: string) => void;
  onImage: (f: File) => void;
}) {
  return (
    <PortalIntoView>
      <style>{ghCss}</style>
      <div className="gh-studio-form">
        <input
          className="gh-name"
          type="text"
          placeholder="name this gradient"
          value={name}
          onChange={(e) => onName(e.target.value)}
          maxLength={28}
        />
        {mode === "corners" ? (
          <div className="gh-corners">
            {(["TL", "TR", "BL", "BR"] as const).map((pos, i) => (
              <label key={pos} className="gh-corner">
                <input
                  type="color"
                  value={corners[i]}
                  onChange={(e) => onCorner(i, e.target.value)}
                />
                <span>{pos}</span>
              </label>
            ))}
          </div>
        ) : (
          <label className="gh-file">
            <input type="file" accept="image/*" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImage(f);
            }} />
            <span>choose a smooth gradient image…</span>
          </label>
        )}
      </div>
    </PortalIntoView>
  );
}

const ghCss = `
.gh-studio-form { display: flex; flex-direction: column; gap: 12px; margin: 10px 0 14px; }
.gh-name {
  background: #1F1B24; color: #ECE7E1; border: 1px solid #FFFFFF14; border-radius: 14px;
  padding: 12px 16px; font-size: 15px; font-family: Outfit, sans-serif; outline: none;
}
.gh-name:focus { border-color: #E08E6D88; }
.gh-corners { display: flex; gap: 18px; justify-content: center; }
.gh-corner { display: flex; flex-direction: column; align-items: center; gap: 6px; font: 500 11px Outfit, sans-serif; color: #6B6572; letter-spacing: 2px; }
.gh-corner input[type="color"] {
  width: 52px; height: 44px; border: none; border-radius: 10px; cursor: pointer; background: none; padding: 0;
}
.gh-corner input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
.gh-corner input[type="color"]::-webkit-color-swatch { border: 1px solid #FFFFFF22; border-radius: 10px; }
.gh-file { display: block; }
.gh-file input[type="file"] { color: #ECE7E1; font-family: Outfit, sans-serif; font-size: 14px; }
.gh-file span { display: block; color: #6B6572; font: 500 11px Outfit, sans-serif; margin-top: 6px; letter-spacing: 1px; }
`;

export default function Studio() {
  if (Platform.OS !== "web") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>the studio lives on the web</Text>
          <Text style={styles.noticeBody}>
            craft gradients at gradhuely.com/studio, then play them everywhere
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  return <StudioWeb />;
}

function StudioWeb() {
  const gradients = useStudio((s) => s.gradients);
  const addGradient = useStudio((s) => s.add);
  const removeGradient = useStudio((s) => s.remove);

  const [mode, setMode] = useState<"corners" | "image">("corners");
  const [name, setName] = useState("");
  const [corners, setCorners] = useState<string[]>([...DEFAULT_CORNERS]);
  const [imageCanonical, setImageCanonical] = useState<string[] | null>(null);
  const [grid, setGrid] = useState<{ label: string; cols: number; rows: number }>(
    GRID_PRESETS[1],
  );
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [availWidth, setAvailWidth] = useState(600);

  const onMeasure = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setAvailWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
  };

  const canonical = useMemo(
    () =>
      mode === "image"
        ? (imageCanonical ?? cornersToCanonical(DEFAULT_CORNERS))
        : cornersToCanonical(corners),
    [mode, imageCanonical, corners],
  );

  const stops = useMemo(() => {
    const n = canonical.length;
    return Array.from({ length: 14 }, (_, i) =>
      canonical[Math.round((i * (n - 1)) / 13)],
    ) as [string, string, ...string[]];
  }, [canonical]);

  const tileColors = useMemo(() => {
    const out: string[] = [];
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const sx = Math.round((x / (grid.cols - 1)) * (CANONICAL_COLS - 1));
        const sy = Math.round((y / (grid.rows - 1)) * (CANONICAL_ROWS - 1));
        out.push(canonical[sy * CANONICAL_COLS + sx]);
      }
    }
    return out;
  }, [canonical, grid]);

  // Exact square tiles that always fit: bounded by available width AND a
  // comfortable preview height — the full grid is visible at every size.
  const GROUT = 1;
  const tileSide = Math.max(
    8,
    Math.floor(
      Math.min(
        (availWidth - grid.cols * GROUT) / grid.cols,
        440 / grid.rows,
      ),
    ),
  );

  const save = () => {
    const id = addGradient({
      name: name.trim() || "untitled",
      kind: mode,
      canonical,
      corners: mode === "corners" ? [corners[0], corners[1], corners[2], corners[3]] : undefined,
    });
    setJustSaved(id);
  };

  const play = (g: StudioGradient, cols: number, rows: number) => {
    router.push({
      pathname: "/play",
      params: { mode: "studio", id: g.id, cols: String(cols), rows: String(rows) },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.title}>studio</Text>
          <View style={styles.back} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View onLayout={onMeasure} collapsable={false} />
          {/* Source mode */}
          <View style={styles.modeRow}>
            {(["corners", "image"] as const).map((m) => (
              <Pressable
                key={m}
                style={[styles.modeChip, mode === m && styles.modeChipActive]}
                onPress={() => {
                  setMode(m);
                  setJustSaved(null);
                }}
              >
                <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                  {m === "corners" ? "corner colors" : "from image"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* DOM form: name + color pickers / file input */}
          <StudioForm
            mode={mode}
            name={name}
            onName={setName}
            corners={corners}
            onCorner={(i, v) => {
              const next = [...corners];
              next[i] = v;
              setCorners(next);
              setJustSaved(null);
            }}
            onImage={(f) => {
              sampleImage(f)
                .then((c) => {
                  setImageCanonical(c);
                  setJustSaved(null);
                  if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, "").slice(0, 28));
                })
                .catch(() => {});
            }}
          />

          {/* Smooth preview */}
          <Text style={styles.sectionLabel}>preview</Text>
          <LinearGradient
            colors={stops}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.smoothPreview}
          />

          {/* Tile preview */}
          <Text style={styles.sectionLabel}>as tiles</Text>
          <View style={styles.gridRow}>
            {GRID_PRESETS.map((g) => (
              <Pressable
                key={g.label}
                style={[styles.gridChip, grid.label === g.label && styles.gridChipActive]}
                onPress={() => setGrid(g)}
              >
                <Text style={styles.gridChipText}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
          <View
            style={[
              styles.tilePreview,
              {
                width: grid.cols * tileSide,
                height: grid.rows * tileSide,
                alignSelf: "center",
              },
            ]}
          >
            {tileColors.map((c, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: (i % grid.cols) * tileSide + GROUT / 2,
                  top: Math.floor(i / grid.cols) * tileSide + GROUT / 2,
                  width: tileSide - GROUT,
                  height: tileSide - GROUT,
                  backgroundColor: c,
                }}
              />
            ))}
          </View>

          <Pressable style={styles.saveButton} onPress={save}>
            <Text style={styles.saveButtonText}>save to library</Text>
          </Pressable>
          {justSaved && (
            <Text style={styles.savedNote}>saved — find it in the library below</Text>
          )}

          {/* Library */}
          <Text style={styles.sectionLabel}>library</Text>
          {gradients.length === 0 && (
            <Text style={styles.empty}>nothing crafted yet</Text>
          )}
          {gradients.map((g) => (
            <View key={g.id} style={styles.libraryRow}>
              <LinearGradient
                colors={(() => {
                  const n = g.canonical.length;
                  return Array.from({ length: 12 }, (_, i) =>
                    g.canonical[Math.round((i * (n - 1)) / 11)],
                  ) as [string, string, ...string[]];
                })()}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.libraryStrip}
              />
              <View style={styles.libraryInfo}>
                <Text style={styles.libraryName}>{g.name}</Text>
                <Text style={styles.libraryMeta}>
                  {g.kind === "image" ? "image" : "corners"} · plays at any size
                </Text>
              </View>
              <Pressable
                style={styles.playChip}
                onPress={() => play(g, grid.cols, grid.rows)}
                accessibilityLabel={`Play ${g.name}`}
              >
                <Text style={styles.playChipText}>
                  play {grid.label}
                </Text>
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() => removeGradient(g.id)}
                accessibilityLabel={`Delete ${g.name}`}
              >
                <Text style={styles.delete}>×</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: palette.textDim, fontSize: 26 },
  title: { ...typeScale.title, color: palette.text, flex: 1, textAlign: "center" },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 80,
  },
  notice: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  noticeTitle: { ...typeScale.heading, ...trackedUpper, color: palette.text, textAlign: "center" },
  noticeBody: { ...typeScale.body, color: palette.textDim, textAlign: "center" },
  modeRow: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  modeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
  },
  modeChipActive: { backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: palette.accent },
  modeText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  modeTextActive: { color: palette.accent },
  sectionLabel: { ...typeScale.small, ...trackedUpper, color: palette.accent, marginTop: spacing.md },
  smoothPreview: { width: "100%", height: 120, borderRadius: radius.md },
  gridRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  gridChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
  },
  gridChipActive: { borderWidth: 1, borderColor: palette.accent },
  gridChipText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  tilePreview: {
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  saveButton: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveButtonText: { ...typeScale.label, ...trackedUpper, color: "#1D1208" },
  savedNote: { ...typeScale.small, color: palette.textFaint, textAlign: "center" },
  empty: { ...typeScale.body, color: palette.textFaint },
  libraryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  libraryStrip: { width: 64, height: 40, borderRadius: radius.sm },
  libraryInfo: { flex: 1, gap: 2 },
  libraryName: { ...typeScale.body, color: palette.text },
  libraryMeta: { ...typeScale.small, color: palette.textFaint },
  playChip: {
    backgroundColor: palette.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  playChipText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  delete: { color: palette.textFaint, fontSize: 22, paddingHorizontal: 4 },
});
