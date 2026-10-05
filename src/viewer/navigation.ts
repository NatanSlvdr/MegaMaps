import type { Camera, Point, Size } from "./camera";
import { screenToWorld, cameraAt } from "./camera";
export interface SavedView {
  center: Point;
  scale: number;
  rotation: number;
}
export interface MapMarker {
  id: string;
  point: Point;
  label: string;
  note: string;
  kind: "bookmark" | "entrance" | "junction" | "landmark" | "note";
  created: number;
}
export interface ManualPosition {
  point: Point;
  updated: number;
}
export interface Checkpoint {
  id: string;
  point: Point;
  label: string;
  confirmed: number;
}
export interface PlannedRoute {
  id: string;
  name: string;
  points: Point[];
  created: number;
  draft: boolean;
}
export interface Layers {
  places: boolean;
  routes: boolean;
  checkpoints: boolean;
  position: boolean;
  labels: boolean;
}
export const layerNames = [
  "places",
  "routes",
  "checkpoints",
  "position",
  "labels",
] as const satisfies readonly (keyof Layers)[];
export interface NavigationState {
  mapId: string;
  view?: SavedView;
  rotationLocked: boolean;
  /** Smart "dark map" mode. Stored under its version 1 name for compatibility. */
  inverted: boolean;
  dimming: number;
  touchLocked: boolean;
  markers: MapMarker[];
  routes: PlannedRoute[];
  position?: ManualPosition;
  checkpoints: Checkpoint[];
  layers: Layers;
}
export type Tool = "browse" | "marker" | "position" | "checkpoint" | "route";
export function defaultNavigation(mapId: string): NavigationState {
  return {
    mapId,
    rotationLocked: true,
    inverted: true, // Underground use: start dark and save OLED battery.
    dimming: 1,
    touchLocked: false,
    markers: [],
    routes: [],
    checkpoints: [],
    layers: {
      places: true,
      routes: true,
      checkpoints: true,
      position: true,
      labels: true,
    },
  };
}
// Older saves predate layer visibility; fill any missing fields from defaults.
export function normalizeNavigation(
  stored: Partial<NavigationState> & { mapId: string },
): NavigationState {
  const defaults = defaultNavigation(stored.mapId);
  return {
    ...defaults,
    ...stored,
    layers: { ...defaults.layers, ...stored.layers },
  };
}
// Distinct, high-contrast colors on both black and light maps.
export const routeColors = ["#38d6ff", "#ff6bd6", "#ffd23f", "#7dff8a", "#b18cff"];
export const routeColor = (state: NavigationState, id: string) =>
  routeColors[
    Math.max(0, state.routes.findIndex((route) => route.id === id)) %
      routeColors.length
  ]!;
export const markerKinds = {
  landmark: { label: "Landmark", color: "#ff9a5c" },
  entrance: { label: "Entrance", color: "#7dff8a" },
  junction: { label: "Junction", color: "#ffd23f" },
  bookmark: { label: "Bookmark", color: "#7fb8ff" },
  note: { label: "Note", color: "#e3e3e3" },
} as const satisfies Record<MapMarker["kind"], { label: string; color: string }>;
export function captureView(camera: Camera, viewport: Size): SavedView {
  return {
    center: screenToWorld(camera, {
      x: viewport.width / 2,
      y: viewport.height / 2,
    }),
    scale: camera.scale,
    rotation: camera.rotation ?? 0,
  };
}
export const restoreView = (view: SavedView, viewport: Size) =>
  cameraAt(view.center, viewport, view.scale, view.rotation);
// Edits use unrotated original pixels. Never infer travel or GPS location from panning.
export function insideImage(point: Point, image: Size) {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= image.width &&
    point.y <= image.height
  );
}
