import { measureTextWidth } from '@/services/textMeasure';

export interface NodeRenderConfigItem {
  fontCss?: string;
  paddingX?: number;
  minWidth?: number;
  maxWidth?: number;
  fixedWidth?: number;
  fixedHeight?: number;
  baseHeight?: number;
}

const DEFAULT_FONT = "500 14px Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji'";

export const NODE_RENDER_CONFIG: Record<string, NodeRenderConfigItem> = {
  objectiveNode: {
    fontCss: DEFAULT_FONT,
    paddingX: 40,
    minWidth: 200,
    maxWidth: 300,
    baseHeight: 56,
  },
  milestoneNode: {
    fontCss: DEFAULT_FONT,
    paddingX: 32,
    minWidth: 180,
    maxWidth: 280,
    baseHeight: 56,
  },
  validationNode: {
    fontCss: DEFAULT_FONT,
    paddingX: 32,
    minWidth: 180,
    maxWidth: 280,
    baseHeight: 56,
  },
  startNode: {
    fixedWidth: 128,
    fixedHeight: 128,
  },
  goalNode: {
    fixedWidth: 128,
    fixedHeight: 128,
  },
};

export function getNodeBoxWidth(nodeType: string, label: string) {
  const cfg = NODE_RENDER_CONFIG[nodeType] || {};
  if (cfg.fixedWidth) return cfg.fixedWidth;
  const font = cfg.fontCss || DEFAULT_FONT;
  const paddingX = cfg.paddingX ?? 40;
  const minWidth = cfg.minWidth ?? 180;
  const maxWidth = cfg.maxWidth ?? 320;
  const textWidth = measureTextWidth(label || '', font);
  const raw = textWidth + paddingX;
  return Math.max(minWidth, Math.min(maxWidth, raw));
}

export function getNodeBoxHeight(nodeType: string) {
  const cfg = NODE_RENDER_CONFIG[nodeType] || {};
  if (cfg.fixedHeight) return cfg.fixedHeight;
  return cfg.baseHeight ?? 56;
}


