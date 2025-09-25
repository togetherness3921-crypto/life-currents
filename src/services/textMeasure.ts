let canvasEl: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

export function initTextMeasurer() {
  if (!canvasEl) {
    try {
      canvasEl = document.createElement('canvas');
      ctx = canvasEl.getContext('2d');
    } catch (e) {
      canvasEl = null;
      ctx = null;
    }
  }
}

export function measureTextWidth(text: string, fontCss: string, fallbackFontSize = 14) {
  const key = `${fontCss}|${text}`;
  if (cache.has(key)) return cache.get(key)!;
  let width = 0;
  try {
    if (!ctx) initTextMeasurer();
    if (ctx) {
      ctx.font = fontCss;
      width = ctx.measureText(text).width;
    } else {
      width = text.length * fallbackFontSize * 0.6;
    }
  } catch {
    width = text.length * fallbackFontSize * 0.6;
  }
  cache.set(key, width);
  return width;
}


