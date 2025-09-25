// Pure layout engine: computes positions from nodesData and measurement helpers

export interface SliceInfo {
  leftmost: number;
  rightmost: number;
  midpoint: number;
  width: number;
}

export interface ComputeLayoutParams {
  nodesData: Record<string, any>;
  levels: Record<number, string[]>;
  nodeToLevel: Record<string, number>;
  getNodeWidth: (nodeId: string, label: string) => number;
  getNodeHeight: (nodeId: string) => number;
  gapDistance: number;
  verticalSpacing: number;
}

export interface PositionsMap {
  [nodeId: string]: { x: number; y: number };
}

export function computeSlicePositions(
  levels: Record<number, string[]>,
  nodesData: Record<string, any>,
  getNodeWidth: (nodeId: string, label: string) => number,
  gapDistance: number
): Record<number, SliceInfo> {
  const slices: Record<number, SliceInfo> = {};
  const sortedLevels = Object.keys(levels).map(Number).sort((a, b) => a - b);
  const sliceWidths: Record<number, number> = {};

  for (const level of sortedLevels) {
    const nodeIds = levels[level];
    let maxWidth = 0;
    nodeIds.forEach((nodeId) => {
      const width = getNodeWidth(nodeId, nodesData[nodeId].label);
      maxWidth = Math.max(maxWidth, width);
    });
    sliceWidths[level] = maxWidth;
  }

  sortedLevels.forEach((level, index) => {
    const width = sliceWidths[level] || 0;
    let midpoint = 0;
    if (index === 0) {
      midpoint = 0;
    } else {
      const prevLevel = sortedLevels[index - 1];
      const prev = slices[prevLevel];
      const prevWidth = sliceWidths[prevLevel] || 0;
      midpoint = prev.midpoint + prevWidth / 2 + gapDistance + width / 2;
    }
    const leftmost = midpoint - width / 2;
    const rightmost = leftmost + width;
    slices[level] = { leftmost, rightmost, midpoint, width };
  });

  return slices;
}

export function computePositions(params: ComputeLayoutParams): PositionsMap {
  const { nodesData, levels, nodeToLevel, getNodeWidth, getNodeHeight, gapDistance, verticalSpacing } = params;

  const slices = computeSlicePositions(levels, nodesData, getNodeWidth, gapDistance);
  const positions: PositionsMap = {};

  // Step 1: Set all X positions based on slice calculations
  Object.entries(nodeToLevel).forEach(([nodeId, level]) => {
    const slice = slices[level];
    if (!slice) return;
    const nodeWidth = getNodeWidth(nodeId, nodesData[nodeId].label);
    positions[nodeId] = { x: slice.midpoint - nodeWidth / 2, y: 0 };
  });

  // Step 2: Set Y positions iteratively from left to right
  const sortedLevels = Object.keys(levels).map(Number).sort((a, b) => a - b);

  sortedLevels.forEach(level => {
    const nodeIdsInLevel = levels[level] || [];

    // Build list with ideal center Y based on parents (average of parent centers)
    const items = nodeIdsInLevel.map((id) => {
      const parents: string[] = (nodesData[id]?.parents || []);
      const parentCenters = parents
        .map((p) => positions[p] ? positions[p].y + getNodeHeight(p) / 2 : undefined)
        .filter((y): y is number => typeof y === 'number');

      const idealCenter = parentCenters.length > 0
        ? parentCenters.reduce((s, y) => s + y, 0) / parentCenters.length
        : 0;

      const h = getNodeHeight(id);
      return { id, h, idealCenter, idealTop: idealCenter - h / 2 };
    });

    // Sort by ideal center so siblings near the same parent stay together
    items.sort((a, b) => a.idealCenter - b.idealCenter || a.id.localeCompare(b.id));

    // Place each node at its ideal top unless spacing requires pushing down
    let lastBottom = -Infinity;
    items.forEach((it) => {
      let top = it.idealTop;
      const minTop = lastBottom + (lastBottom === -Infinity ? 0 : verticalSpacing);
      if (top < minTop) top = minTop;
      positions[it.id].y = top;
      lastBottom = top + it.h;
    });
  });

  return positions;
}

// Adjust centers within a slice to avoid overlaps using node heights and a minimum gap
function resolveSliceOverlaps(
  ids: string[],
  centerY: Record<string, number>,
  getNodeHeight: (nodeId: string) => number,
  verticalGap: number
) {
  if (!ids || ids.length <= 1) return;
  // Sort by desired center
  const sorted = [...ids].sort((a, b) => (centerY[a] ?? 0) - (centerY[b] ?? 0));
  const centers: Record<string, number> = {};
  sorted.forEach((id) => (centers[id] = centerY[id] ?? 0));

  // Forward pass: push down to satisfy minimal separation
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const minDist = getNodeHeight(prev) / 2 + verticalGap + getNodeHeight(cur) / 2;
    if (centers[cur] - centers[prev] < minDist) {
      centers[cur] = centers[prev] + minDist;
    }
  }
  // Backward pass: pull up to satisfy from bottom while preserving order
  for (let i = sorted.length - 2; i >= 0; i--) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const minDist = getNodeHeight(cur) / 2 + verticalGap + getNodeHeight(next) / 2;
    if (centers[next] - centers[cur] < minDist) {
      centers[cur] = centers[next] - minDist;
    }
  }

  // Write back
  sorted.forEach((id) => (centerY[id] = centers[id]));
}


