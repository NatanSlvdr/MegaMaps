// Smart dark map: light maps are inverted, every map has its background pushed
// to pure black (OLED pixels off underground) and its ink stretched for contrast.
// Only GPU-friendly CSS filter functions are used; no tile is re-encoded.
export interface MapTone {
  /** Dominant luminance, normally the paper/background, 0–1. */
  background: number;
  /** Strongest content luminance at the far end from the background, 0–1. */
  ink: number;
  light: boolean;
}
export interface DarkMode {
  filter: string;
  /** Canvas fill that the filter turns into pure black. */
  black: string;
  kind: "inverted" | "deepened" | "already-dark";
}
const BINS = 64;
const luminance = (r: number, g: number, b: number) =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export function analyzeTone(rgba: ArrayLike<number>): MapTone | undefined {
  const histogram = new Float64Array(BINS);
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const alpha = rgba[i + 3]! / 255;
    if (alpha < 0.5) continue;
    histogram[
      Math.min(BINS - 1, Math.floor(luminance(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!) * BINS))
    ]! += 1;
    total++;
  }
  if (!total) return;
  // The smoothed histogram peak is the background: maps are mostly paper/rock.
  let peak = 0,
    best = -1;
  for (let bin = 0; bin < BINS; bin++) {
    const value =
      (histogram[bin - 1] ?? 0) + 2 * histogram[bin]! + (histogram[bin + 1] ?? 0);
    if (value > best) {
      best = value;
      peak = bin;
    }
  }
  const background = (peak + 0.5) / BINS,
    light = background >= 0.5;
  // Ink is the 2% tail on the opposite side of the background.
  let seen = 0,
    ink = light ? 0 : 1;
  for (let step = 0; step < BINS; step++) {
    const bin = light ? step : BINS - 1 - step;
    seen += histogram[bin]!;
    if (seen >= total * 0.02) {
      ink = (bin + 0.5) / BINS;
      break;
    }
  }
  return { background, ink, light };
}

const round = (value: number) => Math.round(value * 1000) / 1000;
export function darkMode(tone: MapTone | undefined): DarkMode {
  // Before analysis, assume a typical light survey sheet.
  const { background, ink, light } = tone ?? {
    background: 0.9,
    ink: 0.1,
    light: true,
  };
  // Work in "distance from background" space: background → 0, ink → high.
  const bg = light ? 1 - background : background,
    fg = light ? 1 - ink : ink;
  // Include paper texture/noise just above the background in the black cutoff.
  // Cap the stretch so dense maps keep their mid-tones.
  const cutoff = Math.min(0.35, bg + 0.06);
  if (!light && cutoff <= 0.08 && fg > 0.6)
    return { filter: "", black: "#000", kind: "already-dark" };
  const contrast = 0.5 / (0.5 - cutoff);
  const stretchedInk = Math.max(0.05, Math.min(1, (fg - 0.5) * contrast + 0.5));
  // Keep the brightest content slightly below white to limit glare in the dark.
  const brightness = Math.min(2.5, 0.92 / stretchedInk);
  const tail = `contrast(${round(contrast)}) brightness(${round(brightness)})`;
  return light
    ? // hue-rotate after invert restores the approximate original hues.
      { filter: `invert(1) hue-rotate(180deg) ${tail}`, black: "#fff", kind: "inverted" }
    : { filter: tail, black: "#000", kind: "deepened" };
}

// Downsample the ≤512px overview; 96px is plenty to find the background tone.
export function measureTone(source: CanvasImageSource & { width: number; height: number }) {
  try {
    const scale = Math.min(1, 96 / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale)),
      height = Math.max(1, Math.round(source.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0, width, height);
    return analyzeTone(ctx.getImageData(0, 0, width, height).data);
  } catch {
    return undefined;
  }
}
