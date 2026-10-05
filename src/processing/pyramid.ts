import { TILE_SIZE, type Level } from "../types";
export function pyramid(width: number, height: number): Level[] {
  const levels: Level[] = [];
  for (let scale = 1; ; scale *= 2) {
    const w = Math.ceil(width / scale),
      h = Math.ceil(height / scale);
    levels.push({
      width: w,
      height: h,
      scale,
      cols: Math.ceil(w / TILE_SIZE),
      rows: Math.ceil(h / TILE_SIZE),
    });
    if (w <= TILE_SIZE && h <= TILE_SIZE) return levels;
  }
}
export const tileCount = (levels: Level[]) =>
  levels.reduce((n, l) => n + l.cols * l.rows, 0);
