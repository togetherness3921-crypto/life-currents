// MeasurementService: normalize and wait for stable measurements

export interface MeasuredDims { [id: string]: { width: number; height: number } }

export interface WaitStableOptions {
  activeIds: string[];
  getMeasured: () => MeasuredDims;
  epsilon?: number;
  firstDelayMs?: number;
  secondDelayMs?: number;
}

export function waitStableMeasurements(options: WaitStableOptions): Promise<MeasuredDims> {
  const { activeIds, getMeasured, epsilon = 0.5, firstDelayMs = 120, secondDelayMs = 120 } = options;

  return new Promise((resolve, reject) => {
    try {
      if (activeIds.length === 0) return resolve({});
      const snapA = snapshot(activeIds, getMeasured());
      setTimeout(() => {
        const snapB = snapshot(activeIds, getMeasured());
        if (equal(snapA, snapB, epsilon)) {
          return resolve(pick(activeIds, getMeasured()));
        }
        setTimeout(() => {
          const snapC = snapshot(activeIds, getMeasured());
          if (equal(snapB, snapC, epsilon)) {
            return resolve(pick(activeIds, getMeasured()));
          }
          resolve(pick(activeIds, getMeasured()));
        }, secondDelayMs);
      }, firstDelayMs);
    } catch (e) {
      reject(e);
    }
  });
}

function snapshot(ids: string[], measured: MeasuredDims) {
  const out: MeasuredDims = {};
  ids.forEach((id) => {
    const m = measured[id];
    if (m) out[id] = { width: m.width, height: m.height };
  });
  return out;
}

function equal(a: MeasuredDims, b: MeasuredDims, eps: number) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const aw = a[k]?.width ?? 0, ah = a[k]?.height ?? 0;
    const bw = b[k]?.width ?? 0, bh = b[k]?.height ?? 0;
    if (Math.abs(aw - bw) >= eps || Math.abs(ah - bh) >= eps) return false;
  }
  return true;
}

function pick(ids: string[], measured: MeasuredDims) {
  const out: MeasuredDims = {};
  ids.forEach((id) => { if (measured[id]) out[id] = measured[id]; });
  return out;
}


