export const PANEL_TABS = [
  "chat",
  "search",
  "history",
  "todos",
  "notes",
  "brain",
  "apps",
] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

import {
  WIDGET_INSET,
  WIDGET_PANEL_GAP,
  WIDGET_PILL_HEIGHT,
} from "./widget.js";

/** Full agent workspace geometry. The companion pill remains independently sized. */
export const PANEL_WIDTH = 980;
export const PANEL_MIN_WIDTH = 720;
export const PANEL_MAX_WIDTH = 1440;
export const PANEL_HEIGHT = 720;
export const PANEL_GAP = WIDGET_PANEL_GAP;
/** Room reserved above the bottom-centre pill. */
export const COMPANION_CLEARANCE =
  WIDGET_PILL_HEIGHT + WIDGET_INSET + WIDGET_PANEL_GAP;
