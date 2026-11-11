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
import { SafeAreaView } from "react-native-safe-area-context";
import GradientBackdrop from "@/components/GradientBackdrop";
import ScreenHeader from "@/components/ScreenHeader";
import {
  bilinearField,
  fieldQuality,
  generateField,
  hexToLab,
  labToHex,
  OPEN_MOOD,
  quantizeField,
  resampleField,
  Rng,
  type Lab,
} from "@/engine";
import MiniBoard from "@/components/MiniBoard";
import BoardSheet from "@/components/BoardSheet";
import UsernamePrompt from "@/components/UsernamePrompt";
import type { BoardChoice } from "@/components/BoardPicker";
import { useAccount } from "@/sync/account";
import { useCommunity } from "@/sync/community";
import { ApiError, explain } from "@/sync/api";
import {
  CANONICAL_COLS,
  CANONICAL_ROWS,
  gradientField,
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

const toLabs4 = (hex: string[]) => hex.map(hexToLab) as [Lab, Lab, Lab, Lab];

function cornersToCanonical(corners: string[]): string[] {
  return bilinearField(toLabs4(corners), CANONICAL_COLS, CANONICAL_ROWS).map(labToHex);
}

/**
 * Sample an image into the canonical grid by AVERAGING each cell's area
 * (in linear light), not by reading one pixel — a single pixel picks up
 * JPEG blocks, dithering and noise, which used to show up as random steps.
 */
function sampleImage(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const W = Math.min(img.width, 600);
      const H = Math.max(1, Math.round((img.height / img.width) * W));
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
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      const enc = (c: number) => {
        const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, "0");
      };
      const out: string[] = [];
      for (let y = 0; y < CANONICAL_ROWS; y++) {
        const y0 = Math.floor((y / CANONICAL_ROWS) * H);
        const y1 = Math.max(y0 + 1, Math.floor(((y + 1) / CANONICAL_ROWS) * H));
        for (let x = 0; x < CANONICAL_COLS; x++) {
          const x0 = Math.floor((x / CANONICAL_COLS) * W);
          const x1 = Math.max(x0 + 1, Math.floor(((x + 1) / CANONICAL_COLS) * W));
          let r = 0;
          let g = 0;
          let b = 0;
          let n = 0;
          for (let py = y0; py < y1; py++) {
            for (let px = x0; px < x1; px++) {
              const i = (py * W + px) * 4;
              r += lin(data[i]);
              g += lin(data[i + 1]);
              b += lin(data[i + 2]);
              n++;
            }
          }
          out.push(`#${enc(r / n)}${enc(g / n)}${enc(b / n)}`);
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

/** Four engine-quality corners: the generator's own taste, as a start. */
function surpriseCorners(seed: number): string[] {
  const f = generateField(new Rng(seed), {
    cols: 7,
    rows: 9,
    step: 0.06,
    twist: [0.3, 0.8],
    mood: OPEN_MOOD,
  });
  return f.corners.map(labToHex);
}

const HUE_NAMES: Array<[number, string]> = [
  [20, "rose"], [45, "coral"], [70, "amber"], [100, "gold"], [125, "lime"],
  [155, "green"], [185, "jade"], [215, "teal"], [245, "azure"], [275, "blue"],
  [300, "violet"], [325, "plum"], [350, "magenta"], [361, "rose"],
];

function colorName(hex: string): string {
  const lab = hexToLab(hex);
  const c = Math.hypot(lab.a, lab.b);
  if (c < 0.03) return lab.l > 0.75 ? "pearl" : lab.l < 0.4 ? "ink" : "slate";
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  const name = HUE_NAMES.find(([lim]) => h < lim)?.[1] ?? "rose";
  return lab.l > 0.82 ? `pale ${name}` : lab.l < 0.45 ? `deep ${name}` : name;
}

/** A name when none is given: "gold to violet", or "gradient 7" for images. */
function autoName(corners: string[] | null, count: number): string {
  if (!corners) return `gradient ${count + 1}`;
  const a = colorName(corners[0]);
  const b = colorName(corners[3]);
  return a === b ? `${a} study` : `${a} to ${b}`;
}

type Readability = { label: string; note: string; ok: boolean };

function readability(labs: Lab[], cols: number, rows: number): Readability {
  const q = fieldQuality(labs, cols, rows);
  if (q.twin < 0.6)
    return {
      label: "ambiguous",
      note: "some tiles in different places look alike (often two corners are too similar) — try corners that differ more",
      ok: false,
    };
  if (q.minStep < 0.02)
    return {
      label: "too faint",
      note: "some neighbors are nearly identical on most screens — try a bigger contrast or a smaller grid",
      ok: false,
    };
  if (q.meanStep >= 0.08) return { label: "clear", note: "an easy, relaxing board", ok: true };
  if (q.meanStep >= 0.05) return { label: "gentle", note: "a comfortable challenge", ok: true };
  return { label: "subtle", note: "a real whisper — expert territory", ok: true };
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
        <label className="gh-label" htmlFor="gh-name">name</label>
        <input
          id="gh-name"
          className="gh-name"
          type="text"
          aria-label="Gradient name"
          placeholder="name this gradient (or we’ll name it for you)"
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
                  aria-label={`${["top-left", "top-right", "bottom-left", "bottom-right"][i]} corner color`}
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
.gh-label { font: 500 11px Outfit, sans-serif; letter-spacing: 2.4px; text-transform: uppercase; color: #E08E6D; margin-bottom: -6px; }
.gh-name {
  background: #1F1B24; color: #ECE7E1; border: 1px solid #FFFFFF14; border-radius: 14px;
  padding: 12px 16px; font-size: 15px; font-family: Outfit, sans-serif; outline: none;
}
.gh-name:focus { border-color: #E08E6D; }
.gh-studio-form :focus-visible { outline: 2px solid #E08E6D; outline-offset: 2px; }
.gh-corners { display: flex; gap: 18px; justify-content: center; }
.gh-corner { display: flex; flex-direction: column; align-items: center; gap: 6px; font: 500 11px Outfit, sans-serif; color: #958E9C; letter-spacing: 2px; }
.gh-corner input[type="color"] {
  width: 52px; height: 44px; border: none; border-radius: 10px; cursor: pointer; background: none; padding: 0;
}
.gh-corner input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
.gh-corner input[type="color"]::-webkit-color-swatch { border: 1px solid #FFFFFF22; border-radius: 10px; }
.gh-file { display: block; }
.gh-file input[type="file"] { color: #ECE7E1; font-family: Outfit, sans-serif; font-size: 14px; }
.gh-file span { display: block; color: #958E9C; font: 500 11px Outfit, sans-serif; margin-top: 6px; letter-spacing: 1px; }
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
  const updateGradient = useStudio((s) => s.update);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [libraryView, setLibraryView] = useState<"grid" | "list">("grid");
  const editing = gradients.find((g) => g.id === editingId) ?? null;

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

  // The solved field at the preview size: exact corner blend, or a smooth
  // bicubic resample of the image grid — the same path play uses.
  const fieldAt = useMemo(
    () => (cols: number, rows: number): Lab[] =>
      mode === "corners"
        ? bilinearField(toLabs4(corners), cols, rows)
        : resampleField(canonical.map(hexToLab), CANONICAL_COLS, CANONICAL_ROWS, cols, rows),
    [mode, corners, canonical],
  );

  const smooth = useMemo(() => fieldAt(32, 20).map(labToHex), [fieldAt]);

  const tileLabs = useMemo(() => fieldAt(grid.cols, grid.rows), [fieldAt, grid]);
  const tileColors = useMemo(
    () => quantizeField(tileLabs, grid.cols, grid.rows),
    [tileLabs, grid],
  );
  const read = useMemo(
    () => readability(tileColors.map(hexToLab), grid.cols, grid.rows),
    [tileColors, grid],
  );

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

  const finalName = () => name.trim() || autoName(mode === "corners" ? corners : null, gradients.length);

  const save = () => {
    const id = addGradient({
      name: finalName(),
      kind: mode,
      canonical,
      corners: mode === "corners" ? [corners[0], corners[1], corners[2], corners[3]] : undefined,
    });
    setEditingId(null);
    setJustSaved(id);
  };

  const saveChanges = () => {
    if (!editing) return;
    updateGradient(editing.id, {
      name: finalName(),
      kind: mode,
      canonical,
      corners: mode === "corners" ? [corners[0], corners[1], corners[2], corners[3]] : undefined,
    });
    setJustSaved(editing.id);
    setEditingId(null);
  };

  /** Load a library gradient into the editor. */
  const edit = (g: StudioGradient) => {
    setEditingId(g.id);
    setJustSaved(null);
    setName(g.name);
    setMode(g.kind);
    if (g.kind === "corners" && g.corners) setCorners([...g.corners]);
    else setImageCanonical(g.canonical);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
  };

  const play = (g: StudioGradient, cols: number, rows: number) => {
    router.push({
      pathname: "/play",
      params: { mode: "studio", id: g.id, cols: String(cols), rows: String(rows) },
    });
  };

  // ---- choose a size before playing
  const [sheetFor, setSheetFor] = useState<StudioGradient | null>(null);
  const [sheetChoice, setSheetChoice] = useState<BoardChoice>({ cols: 7, rows: 9 });
  const openSheet = (g: StudioGradient) => {
    setSheetChoice({ cols: grid.cols, rows: grid.rows });
    setSheetFor(g);
  };
  const sheetPreview = useMemo(
    () =>
      sheetFor
        ? {
            colors: quantizeField(gradientField(sheetFor, sheetChoice.cols, sheetChoice.rows), sheetChoice.cols, sheetChoice.rows),
            cols: sheetChoice.cols,
            rows: sheetChoice.rows,
          }
        : null,
    [sheetFor, sheetChoice],
  );
  const sheetNote = useMemo(() => {
    if (!sheetPreview) return null;
    const r = readability(sheetPreview.colors.map(hexToLab), sheetPreview.cols, sheetPreview.rows);
    return { text: `${r.label} — ${r.note}`, warn: !r.ok };
  }, [sheetPreview]);

  // ---- share to the community
  const publish = useCommunity((s) => s.publish);
  const unpublish = useCommunity((s) => s.unpublish);
  const [shareMsg, setShareMsg] = useState<{ id: string; text: string } | null>(null);
  const [askName, setAskName] = useState<StudioGradient | null>(null);

  const share = async (g: StudioGradient) => {
    const acct = useAccount.getState();
    if (acct.status !== "signed-in") {
      setShareMsg({ id: g.id, text: "sign in from your account page to share with the community" });
      return;
    }
    if (!acct.username) {
      setAskName(g);
      return;
    }
    setShareMsg({ id: g.id, text: "sharing…" });
    try {
      if (g.sharedId) await unpublish(g.sharedId).catch(() => {});
      const board = await publish({
        name: g.name,
        kind: g.kind,
        corners: g.corners,
        canonical: g.canonical,
      });
      updateGradient(g.id, { sharedId: board.id });
      setShareMsg({ id: g.id, text: "shared — it's in the community gallery" });
    } catch (e) {
      setShareMsg({ id: g.id, text: explain(e instanceof ApiError ? e.code : "") });
    }
  };

  const unshare = async (g: StudioGradient) => {
    if (!g.sharedId) return;
    try {
      await unpublish(g.sharedId);
    } catch {
      /* already gone */
    }
    updateGradient(g.id, { sharedId: undefined });
    setShareMsg({ id: g.id, text: "removed from the community" });
  };

  const justSavedGradient = justSaved ? gradients.find((g) => g.id === justSaved) ?? null : null;

  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenHeader title="studio" />

        <ScrollView contentContainerStyle={styles.content}>
          <View onLayout={onMeasure} collapsable={false} />
          {/* Source mode */}
          <View style={styles.modeRow}>
            {(["corners", "image"] as const).map((m) => (
              <Pressable accessibilityRole="button"
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
          {editing && (
            <View style={styles.editBanner} accessibilityLiveRegion="polite">
              <Text style={styles.editBannerText}>
                editing <Text style={styles.editBannerName}>{editing.name}</Text>
              </Text>
              <Pressable accessibilityRole="button" onPress={cancelEdit} hitSlop={8}>
                <Text style={styles.ghostButtonText}>cancel</Text>
              </Pressable>
            </View>
          )}

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

          {mode === "corners" && (
            <Pressable accessibilityRole="button"
              style={styles.surprise}
              onPress={() => {
                setCorners(surpriseCorners(Date.now() >>> 0));
                setJustSaved(null);
              }}
              accessibilityLabel="Suggest four corner colors"
            >
              <Text style={styles.surpriseText}>surprise me</Text>
            </Pressable>
          )}

          {/* Smooth preview: the true 2D field, seamless */}
          <Text style={styles.sectionLabel}>preview</Text>
          <MiniBoard colors={smooth} cols={32} rows={20} fill radius={radius.md} />

          {/* Tile preview */}
          <Text style={styles.sectionLabel}>as tiles</Text>
          <View style={styles.gridRow}>
            {GRID_PRESETS.map((g) => (
              <Pressable accessibilityRole="button"
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

          <View
            style={[styles.readRow, !read.ok && styles.readRowWarn]}
            accessibilityLiveRegion="polite"
          >
            <Text style={[styles.readLabel, !read.ok && styles.readLabelWarn]}>{read.label}</Text>
            <Text style={styles.readNote}>{read.note}</Text>
          </View>

          {editing ? (
            <View style={styles.saveRow}>
              <Pressable accessibilityRole="button" style={[styles.saveButton, styles.saveFlex]} onPress={saveChanges}>
                <Text style={styles.saveButtonText}>save changes</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={[styles.ghostButton, styles.saveFlex]} onPress={save}>
                <Text style={styles.ghostButtonText}>save as new</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={cancelEdit}>
                <Text style={styles.ghostButtonText}>cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" style={styles.saveButton} onPress={save}>
              <Text style={styles.saveButtonText}>save to library</Text>
            </Pressable>
          )}
          {justSavedGradient && (
            <View style={styles.savedBox} accessibilityLiveRegion="polite">
              <Text style={styles.savedNote}>
                saved to your library{justSavedGradient.sharedId ? " · shared with the community" : ""}
              </Text>
              {!justSavedGradient.sharedId && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Share ${justSavedGradient.name} with the community`}
                  onPress={() => void share(justSavedGradient)}
                  style={styles.savedShare}
                >
                  <Text style={styles.savedShareText}>share with the community</Text>
                </Pressable>
              )}
              {shareMsg?.id === justSavedGradient.id && !justSavedGradient.sharedId && (
                <Text style={styles.shareMsg}>{shareMsg.text}</Text>
              )}
            </View>
          )}

          {/* Library */}
          <View style={styles.libraryHeader}>
            <Text style={styles.sectionLabel}>library</Text>
            <View style={styles.viewToggle} accessibilityRole="radiogroup">
              {(["grid", "list"] as const).map((v) => (
                <Pressable
                  key={v}
                  accessibilityRole="radio"
                  aria-checked={libraryView === v}
                  onPress={() => setLibraryView(v)}
                  style={[styles.viewChip, libraryView === v && styles.viewChipActive]}
                >
                  <Text style={[styles.viewChipText, libraryView === v && styles.viewChipTextActive]}>{v}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {gradients.length === 0 && (
            <Text style={styles.empty}>nothing crafted yet</Text>
          )}
          {libraryView === "grid" ? (
            <View style={styles.libraryGrid}>
              {gradients.map((g) => (
                <View key={g.id} style={[styles.gridCard, g.id === editingId && styles.gridCardEditing]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Play ${g.name} at ${grid.label}`}
                    onPress={() => openSheet(g)}
                    style={styles.gridArt}
                  >
                    <MiniBoard
                      colors={quantizeField(gradientField(g, grid.cols, grid.rows), grid.cols, grid.rows)}
                      cols={grid.cols}
                      rows={grid.rows}
                      height={150}
                      radius={radius.sm}
                    />
                  </Pressable>
                  <Text style={styles.gridName} numberOfLines={1}>{g.name}</Text>
                  {shareMsg?.id === g.id && (
                    <Text style={styles.shareMsg} accessibilityLiveRegion="polite">{shareMsg.text}</Text>
                  )}
                  <View style={styles.gridActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${g.name}`} hitSlop={6} style={styles.gridActionHit} onPress={() => edit(g)}>
                      <Text style={styles.gridAction}>edit</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Play ${g.name} — choose a size`} hitSlop={6} style={styles.gridActionHit} onPress={() => openSheet(g)}>
                      <Text style={styles.gridAction}>play</Text>
                    </Pressable>
                    {g.sharedId ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Stop sharing ${g.name}`} hitSlop={6} style={styles.gridActionHit} onPress={() => void unshare(g)}>
                        <Text style={styles.gridActionShared}>shared ✓</Text>
                      </Pressable>
                    ) : (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Share ${g.name} with the community`} hitSlop={6} style={styles.gridActionHit} onPress={() => void share(g)}>
                        <Text style={styles.gridAction}>share</Text>
                      </Pressable>
                    )}
                    <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${g.name}`} hitSlop={6} style={styles.gridActionHit} onPress={() => removeGradient(g.id)}>
                      <Text style={styles.gridActionDim}>delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            gradients.map((g) => (
              <View key={g.id} style={[styles.libraryRow, g.id === editingId && styles.gridCardEditing]}>
                <MiniBoard
                  colors={quantizeField(gradientField(g, 6, 8), 6, 8)}
                  cols={6}
                  rows={8}
                  height={52}
                  radius={radius.sm}
                />
                <View style={styles.libraryInfo}>
                  <Text style={styles.libraryName}>{g.name}</Text>
                  <Text style={styles.libraryMeta}>
                    {g.kind === "image" ? "image" : "corners"} · plays at any size
                  </Text>
                </View>
                <Pressable accessibilityRole="button" style={styles.playChip} onPress={() => edit(g)} accessibilityLabel={`Edit ${g.name}`}>
                  <Text style={styles.playChipText}>edit</Text>
                </Pressable>
                <Pressable accessibilityRole="button" style={styles.playChip} onPress={() => openSheet(g)} accessibilityLabel={`Play ${g.name} — choose a size`}>
                  <Text style={styles.playChipText}>play</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.playChip}
                  onPress={() => void (g.sharedId ? unshare(g) : share(g))}
                  accessibilityLabel={g.sharedId ? `Stop sharing ${g.name}` : `Share ${g.name} with the community`}
                >
                  <Text style={styles.playChipText}>{g.sharedId ? "shared ✓" : "share"}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => removeGradient(g.id)} accessibilityLabel={`Delete ${g.name}`}>
                  <Text style={styles.delete}>×</Text>
                </Pressable>
              </View>
            ))
          )}
          {gradients.length > 0 && (
            <Text style={styles.libraryHint}>
              thumbnails show the {grid.label} board — change the size under "as tiles" to compare at any difficulty
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>

      <BoardSheet
        visible={sheetFor !== null}
        title={sheetFor?.name ?? ""}
        byline={sheetFor?.sharedId ? "yours · shared with the community" : "yours"}
        value={sheetChoice}
        onChange={setSheetChoice}
        preview={sheetPreview}
        note={sheetNote}
        onPlay={() => {
          if (!sheetFor) return;
          const g = sheetFor;
          setSheetFor(null);
          play(g, sheetChoice.cols, sheetChoice.rows);
        }}
        onClose={() => setSheetFor(null)}
      />

      <UsernamePrompt
        visible={askName !== null}
        onDone={(ok) => {
          const g = askName;
          setAskName(null);
          if (ok && g) void share(g);
        }}
      />
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
  surprise: {
    alignSelf: "center",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  surpriseText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  saveRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch", flexWrap: "wrap" },
  saveFlex: { flexGrow: 1 },
  ghostButton: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  ghostButtonText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  editBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  editBannerText: { ...typeScale.small, ...trackedUpper, color: palette.text },
  editBannerName: { color: palette.accent },
  libraryHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  viewToggle: { flexDirection: "row", gap: 4, backgroundColor: palette.surface, borderRadius: radius.pill, padding: 3 },
  viewChip: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  viewChipActive: { backgroundColor: palette.surfaceRaised },
  viewChipText: { ...typeScale.small, ...trackedUpper, color: palette.textFaint },
  viewChipTextActive: { color: palette.text },
  libraryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridCard: {
    width: 150,
    flexGrow: 1,
    maxWidth: 220,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  gridCardEditing: { borderColor: palette.accent },
  gridArt: { alignItems: "center", justifyContent: "center", height: 150 },
  gridName: { ...typeScale.body, color: palette.text },
  gridActions: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md, rowGap: 0 },
  gridActionHit: { minHeight: 36, justifyContent: "center" },
  savedBox: { alignItems: "center", gap: spacing.sm },
  savedShare: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.accent,
    justifyContent: "center",
  },
  savedShareText: { ...typeScale.small, ...trackedUpper, color: palette.accent },
  gridAction: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  gridActionShared: { ...typeScale.small, ...trackedUpper, color: "#7FD1A8" },
  shareMsg: { ...typeScale.small, color: palette.textDim },
  gridActionDim: { ...typeScale.small, ...trackedUpper, color: palette.textFaint },
  libraryHint: { ...typeScale.small, color: palette.textFaint, textAlign: "center" },
  readRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  readRowWarn: { borderWidth: 1, borderColor: palette.accent },
  readLabel: { ...typeScale.small, ...trackedUpper, color: palette.text, minWidth: 84 },
  readLabelWarn: { color: palette.accent },
  readNote: { ...typeScale.small, color: palette.textDim, flex: 1 },
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
  saveButtonText: { ...typeScale.label, ...trackedUpper, color: palette.onAccent },
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
