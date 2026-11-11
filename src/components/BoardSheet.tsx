/**
 * "Choose your board" — the step between picking a board and playing it.
 * A modal sheet holding the BoardPicker, a title and a big play button.
 */

import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import BoardPicker, { type BoardChoice, type BoardPreview } from "@/components/BoardPicker";
import { palette, radius, spacing, type as typeScale, trackedUpper } from "@/theme";

export default function BoardSheet({
  visible,
  title,
  byline,
  value,
  onChange,
  preview,
  showSubtlety,
  note,
  playLabel = "play",
  onPlay,
  onClose,
  footer,
}: {
  visible: boolean;
  title: string;
  byline?: string;
  value: BoardChoice;
  onChange: (v: BoardChoice) => void;
  preview: BoardPreview | null;
  showSubtlety?: boolean;
  note?: { text: string; warn?: boolean } | null;
  playLabel?: string;
  onPlay: () => void;
  onClose: () => void;
  footer?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                  {title}
                </Text>
                {byline ? <Text style={styles.byline}>{byline}</Text> : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={10}
                style={styles.close}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <BoardPicker
              value={value}
              onChange={onChange}
              preview={preview}
              showSubtlety={showSubtlety}
              note={note}
            />
            <Pressable accessibilityRole="button" style={styles.play} onPress={onPlay}>
              <Text style={styles.playText}>
                {playLabel} · {value.cols}×{value.rows}
              </Text>
            </Pressable>
            {footer}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#000000B0",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "94%",
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  content: { padding: spacing.xl, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  title: { ...typeScale.title, color: palette.text },
  byline: { ...typeScale.small, color: palette.textDim, marginTop: 2 },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  closeText: { color: palette.textDim, fontSize: 28, lineHeight: 30 },
  play: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: spacing.md,
  },
  playText: { ...typeScale.label, ...trackedUpper, color: "#1D1208" },
});
