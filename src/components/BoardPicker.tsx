/**
 * Choose a board's size (and, for generated boards, its subtlety) while
 * watching a live preview. Used everywhere a board is about to be played:
 * endless, the journey, Studio and community boards.
 */

import { useMemo } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import MiniBoard from "@/components/MiniBoard";
import {
  SIZE_LIMITS,
  SIZE_PRESETS,
  clampSize,
  stepFor,
  type ZenSubtlety,
} from "@/engine";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

export interface BoardChoice {
  cols: number;
  rows: number;
  subtlety?: ZenSubtlety;
}

export interface BoardPreview {
  colors: string[];
  cols: number;
  rows: number;
}

const SUBTLETIES: Array<{ id: ZenSubtlety; label: string }> = [
  { id: "gentle", label: "clear" },
  { id: "subtle", label: "soft" },
  { id: "ethereal", label: "whisper" },
];

/** A plain-words description of how hard a step size reads. */
export function stepWords(step: number): string {
  if (step >= 0.08) return "clear steps";
  if (step >= 0.055) return "gentle steps";
  if (step >= 0.042) return "soft steps";
  return "whisper-quiet steps";
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) =>
        onChange(e.nativeEvent.actionName === "increment" ? Math.min(max, value + 1) : Math.max(min, value - 1))
      }
    >
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`fewer ${label}`}
          disabled={value <= min}
          onPress={() => onChange(value - 1)}
          style={[styles.stepBtn, value <= min && styles.dim]}
          hitSlop={6}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`more ${label}`}
          disabled={value >= max}
          onPress={() => onChange(value + 1)}
          style={[styles.stepBtn, value >= max && styles.dim]}
          hitSlop={6}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function BoardPicker({
  value,
  onChange,
  preview,
  showSubtlety = false,
  note,
}: {
  value: BoardChoice;
  onChange: (next: BoardChoice) => void;
  /** Colors to show at the chosen size (already computed by the parent). */
  preview: BoardPreview | null;
  showSubtlety?: boolean;
  /** Extra line under the preview (e.g. a readability note). */
  note?: { text: string; warn?: boolean } | null;
}) {
  const { width, height } = useWindowDimensions();
  const { cols, rows } = value;
  const set = (c: number, r: number, sub = value.subtlety) => {
    const [cc, rr] = clampSize(c, r);
    onChange({ cols: cc, rows: rr, subtlety: sub });
  };

  // Would tiles be uncomfortably small on THIS screen?
  const tilePx = Math.floor(Math.min((width - 20) / cols, (height - 140) / rows));
  const step = stepFor(cols, rows, value.subtlety ?? "gentle");
  const sameSteps = useMemo(
    () => SUBTLETIES.map((s) => stepFor(cols, rows, s.id)),
    [cols, rows],
  );

  const previewHeight = Math.min(220, Math.max(140, height * 0.26));

  return (
    <View style={styles.wrap}>
      <View style={[styles.previewBox, { height: previewHeight }]}>
        {preview && (
          <MiniBoard
            colors={preview.colors}
            cols={preview.cols}
            rows={preview.rows}
            height={previewHeight}
            radius={radius.sm}
          />
        )}
      </View>
      <Text style={styles.summary} accessibilityLiveRegion="polite">
        {cols} × {rows} · {cols * rows} tiles
        {showSubtlety ? ` · ${stepWords(step)}` : ""}
      </Text>
      {note && <Text style={[styles.note, note.warn && styles.warn]}>{note.text}</Text>}
      {tilePx < 30 && (
        <Text style={[styles.note, styles.warn]}>
          tiles will be about {Math.max(1, tilePx)}px on this screen — great on a larger display
        </Text>
      )}

      <Text style={styles.section}>size</Text>
      <View style={styles.chips}>
        {SIZE_PRESETS.map(([c, r]) => {
          const on = c === cols && r === rows;
          return (
            <Pressable
              key={`${c}x${r}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${c} by ${r}, ${c * r} tiles`}
              onPress={() => set(c, r)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {c}×{r}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.custom}>
        <Stepper label="columns" value={cols} min={SIZE_LIMITS.minSide} max={SIZE_LIMITS.maxCols} onChange={(v) => set(v, rows)} />
        <Stepper label="rows" value={rows} min={SIZE_LIMITS.minSide} max={SIZE_LIMITS.maxRows} onChange={(v) => set(cols, v)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Swap columns and rows"
          onPress={() => set(rows, cols)}
          style={styles.flip}
        >
          <Text style={styles.flipText}>⇄ flip</Text>
        </Pressable>
      </View>

      {showSubtlety && (
        <>
          <Text style={styles.section}>contrast</Text>
          <View style={styles.chips}>
            {SUBTLETIES.map((s, i) => {
              const on = (value.subtlety ?? "subtle") === s.id;
              const redundant = i > 0 && sameSteps[i] === sameSteps[i - 1];
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: redundant && !on }}
                  disabled={redundant && !on}
                  onPress={() => set(cols, rows, s.id)}
                  style={[styles.chip, styles.chipWide, on && styles.chipOn, redundant && !on && styles.dim]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {sameSteps[0] === sameSteps[2] && (
            <Text style={styles.note}>at this size every board is already a whisper</Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  previewBox: { alignItems: "center", justifyContent: "center" },
  summary: { ...typeScale.label, color: palette.text, textAlign: "center", marginTop: spacing.xs },
  note: { ...typeScale.small, color: palette.textDim, textAlign: "center" },
  warn: { color: palette.accent },
  section: { ...typeScale.small, ...trackedUpper, color: palette.accent, marginTop: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipWide: { flexGrow: 1, alignItems: "center" },
  chipOn: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
  chipText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
  chipTextOn: { color: palette.text },
  dim: { opacity: 0.4 },
  custom: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md, flexWrap: "wrap", marginTop: spacing.xs },
  stepper: { gap: 4 },
  stepperLabel: { ...typeScale.small, ...trackedUpper, color: palette.textFaint },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surfaceRaised,
    borderRadius: radius.pill,
  },
  stepBtn: { width: 44, height: 40, alignItems: "center", justifyContent: "center" },
  stepBtnText: { color: palette.text, fontSize: 20 },
  stepValue: { ...typeScale.label, color: palette.text, minWidth: 26, textAlign: "center", fontVariant: ["tabular-nums"] },
  flip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.line,
    justifyContent: "center",
  },
  flipText: { ...typeScale.small, ...trackedUpper, color: palette.textDim },
});
