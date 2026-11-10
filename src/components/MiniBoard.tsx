/**
 * A seamless little picture of a solved board — every tile, no grout. Used
 * for gallery cards, the Studio library and the solved sheet. (The old
 * thumbnails squeezed row-major colors into one linear strip, which
 * jumped from the end of each row back to the start of the next.)
 */

import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

interface MiniBoardProps {
  colors: string[];
  cols: number;
  rows: number;
  /** Rendered height in px; width follows the board's aspect. */
  height?: number;
  /** Or fill the parent's width (aspect preserved). */
  fill?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

function MiniBoard({ colors, cols, rows, height = 64, fill, radius = 6, style }: MiniBoardProps) {
  const rowViews = [];
  for (let y = 0; y < rows; y++) {
    const cells = [];
    for (let x = 0; x < cols; x++) {
      cells.push(<View key={x} style={[styles.cell, { backgroundColor: colors[y * cols + x] }]} />);
    }
    rowViews.push(
      <View key={y} style={styles.row}>
        {cells}
      </View>,
    );
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`gradient, ${cols} by ${rows}`}
      style={[
        styles.wrap,
        { borderRadius: radius, aspectRatio: cols / rows },
        fill ? { width: "100%" } : { height },
        style,
      ]}
    >
      {rowViews}
    </View>
  );
}

export default memo(MiniBoard);

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  row: { flex: 1, flexDirection: "row" },
  // A hair of overlap hides sub-pixel seams between flex cells.
  cell: { flex: 1, marginRight: -0.5, marginBottom: -0.5 },
});
