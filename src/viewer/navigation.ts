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
export interface NavigationState {
  mapId: string;
  view?: SavedView;
  rotationLocked: boolean;
  inverted: boolean;
  dimming: number;
  touchLocked: boolean;
  markers: MapMarker[];
  routes: PlannedRoute[];
  position?: ManualPosition;
  checkpoints: Checkpoint[];
}
export type Tool = "browse" | "marker" | "position" | "checkpoint" | "route";
export function defaultNavigation(mapId: string): NavigationState {
  return {
    mapId,
    rotationLocked: true,
    inverted: false,
    dimming: 1,
    touchLocked: false,
    markers: [],
    routes: [],
    checkpoints: [],
  };
}
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
