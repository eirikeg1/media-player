/** Width of one hour in the EPG timeline (pixels) */
export const HOUR_WIDTH = 200;

/** Height of each channel row (pixels) */
export const ROW_HEIGHT = 60;

/** Width of the fixed channel name/logo column (pixels) */
export const CHANNEL_COL_WIDTH = 80;

/** Height of the fixed time header row (pixels) */
export const TIME_HEADER_HEIGHT = 40;

/** Total width of one full day in the timeline */
export const DAY_WIDTH = HOUR_WIDTH * 24;

/** Minimum width for a programme block so short programmes remain tappable */
export const MIN_PROGRAMME_WIDTH = 30;

/** Deterministic block widths per row to mimic real programme blocks in skeletons */
export const SKELETON_ROW_PATTERNS: number[][] = [
  [120, 200, 80, 160],
  [80, 160, 120, 200],
  [200, 120, 160, 80],
  [160, 80, 200, 120],
  [120, 160, 200, 80],
  [80, 200, 120, 160],
  [200, 80, 160, 120],
  [160, 120, 80, 200],
  [120, 200, 160, 80],
  [80, 120, 200, 160],
];
