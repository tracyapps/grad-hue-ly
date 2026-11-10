/** Public surface of the puzzle engine. UI imports only from here. */
export { hashSeed, Rng } from "./rng";
export {
  deltaEok,
  labToHex,
  hexToLab,
  lchToLab,
  labToLch,
  fitToGamut,
  type Lab,
  type Lch,
  type Rgb,
} from "./color";
export { makeRect, adjacentPairs, neighborIndices, type GridSpec, type Cell } from "./grid";
export {
  generateCornerField,
  ensureDistinct,
  smoothField,
  bilinearSample,
  FieldTuneError,
  type FieldParams,
  type GeneratedField,
  type CornerMode,
} from "./field";
export { shuffledPlacement } from "./shuffle";
export {
  levelParams,
  zenParams,
  todayParams,
  chapterOf,
  chapterName,
  CHAPTER_SIZE,
  type PuzzleParams,
  type ZenOptions,
  type ZenSize,
  type ZenSubtlety,
} from "./difficulty";
export {
  generatePuzzle,
  generateLevel,
  generateToday,
  generateZen,
  puzzleFromColors,
  isSolved,
  applySwap,
  applyCornerLocks,
  cornerCells,
  resampleColors,
  levelSeed,
  todaySeed,
  zenSeed,
  DEFAULT_WORLD_SEED,
  type Puzzle,
} from "./puzzle";
