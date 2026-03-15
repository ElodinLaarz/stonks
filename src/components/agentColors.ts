/** Per-agent colors, indexed by agent order. Shared across all panels. */
export const AGENT_COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ce93d8', '#80cbc4'];

/** Semantic UI colors for outcome and status indicators. */
export const THEME = {
  info: '#4fc3f7', // primary blue — headers, buttons, predictive-correlation score
  success: '#81c784', // green — oracle caught, win-rate score
  warning: '#ffb74d', // orange — generation end, timing-clustering score
  danger: '#f06292', // pink — accused, oracle escaped, behavioral-fingerprint score
} as const;
