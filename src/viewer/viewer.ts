import { TILE_SIZE, tileKey, type MapRecord } from "../types";
import { payloadStore } from "../storage/payloads";
import {
  fitCamera,
  constrain,
  zoomAt,
  chooseLevel,
  visibleTiles,
  type Camera,
  type Point,
  cameraAt,
  screenToWorld,
  worldToScreen,
  transformAt,
} from "./camera";
import { TileCache } from "./cache";
import { attachInteractions } from "./interactions";
import {
  defaultNavigation,
  captureView,
  restoreView,
  insideImage,
  type NavigationState,
  type Tool,
  type MapMarker,
} from "./navigation";
import { NavigationOverlay } from "./overlays";
export interface ViewerOptions {
  navigation: NavigationState;
  overlay: SVGSVGElement;
  onView(): void;
  onTap(point: Point): void;
  onMarker(marker: MapMarker): void;
}
export class Viewer {
  private navigation: NavigationState;
  private overlay?: NavigationOverlay;
  private tool: Tool = "browse";
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private width = 1;
  private height = 1;
  private dpr = 1;
  private frame = 0;
  private animation = 0;
  private base?: ImageBitmap;
  private disposed = false;
  private cache: TileCache;
  private observer: ResizeObserver;
  private interactions;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private frames = 0;
  private controller = new AbortController();
  constructor(
    private canvas: HTMLCanvasElement,
    private map: MapRecord,
    private onZoom: (percent: number) => void,
    private onError: (message: string) => void,
    private options?: ViewerOptions,
  ) {
    this.navigation = options?.navigation ?? defaultNavigation(map.id);
    if (options) {
      this.overlay = new NavigationOverlay(options.overlay);
      this.overlay.rebuild(this.navigation);
    }
    this.cache = new TileCache(
      payloadStore(map.backend),
      map.id,
      () => this.invalidate(),
      onError,
    );
    this.observer = new ResizeObserver(() => this.resize());
    this.interactions = attachInteractions(canvas, {
      getCamera: () => this.camera,
      setCamera: (camera) => this.setCamera(camera),
      limits: () => this.limits(),
      animate: (camera) => this.animate(camera),
      stopAnimation: () => this.stopAnimation(),
      locked: () => this.navigation.touchLocked,
      rotationLocked: () => this.navigation.rotationLocked,
      editing: () => this.tool !== "browse",
      tap: (point) => this.tap(point),
    });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.interactions.reset();
      },
      { signal: this.controller.signal },
    );
    canvas.addEventListener(
      "keydown",
      (event) => {
        if (this.navigation.touchLocked) return;
        const camera = this.camera,
          movement = 60;
        const deltas: Record<string, [number, number]> = {
          ArrowLeft: [movement, 0],
          ArrowRight: [-movement, 0],
          ArrowUp: [0, movement],
          ArrowDown: [0, -movement],
        };
        const delta = deltas[event.key];
        if (delta) {
          event.preventDefault();
          this.interactions.stop();
          this.setCamera({
            ...camera,
            x: camera.x + delta[0],
            y: camera.y + delta[1],
          });
        }
        if (["+", "=", "-", "_"].includes(event.key)) {
          event.preventDefault();
          this.interactions.stop();
          const { min, max } = this.limits();
          this.animate(
            zoomAt(
              camera,
              Math.max(
                min,
                Math.min(
                  max,
                  camera.scale *
                    (event.key === "-" || event.key === "_" ? 1 / 1.5 : 1.5),
                ),
              ),
              this.width / 2,
              this.height / 2,
            ),
          );
        }
      },
      { signal: this.controller.signal },
    );
    this.observer.observe(canvas);
    const saved = this.navigation.view;
    this.resize();
    if (saved) this.setCamera(restoreView(saved, this.viewport()));
    else this.fit(false);
    this.applyAppearance();
    void this.loadBase();
  }
  private viewport() {
    return { width: this.width, height: this.height };
  }
  private limits(rotation = this.camera.rotation ?? 0) {
    return {
      min: fitCamera(this.map, this.viewport(), rotation).scale,
      max: Math.max(4, fitCamera(this.map, this.viewport(), rotation).scale),
    };
  }
  private resize() {
    this.interactions?.reset();
    const old = this.viewport(),
      center = screenToWorld(this.camera, {
        x: old.width / 2,
        y: old.height / 2,
      });
    const wasFit =
      Math.abs(
        this.camera.scale -
          fitCamera(this.map, old, this.camera.rotation ?? 0).scale,
      ) < 0.00001;
    this.width = Math.max(1, this.canvas.clientWidth);
    this.height = Math.max(1, this.canvas.clientHeight);
    // Cap the backing canvas at 4 MP (16 MiB); don't blindly allocate DPR=3 canvases.
    this.dpr = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(4_000_000 / (this.width * this.height)),
    );
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    if (wasFit) this.fit(false);
    else
      this.setCamera(
        cameraAt(
          center,
          this.viewport(),
          this.camera.scale,
          this.camera.rotation ?? 0,
        ),
      );
  }
  private async loadBase() {
    try {
      const index = this.map.levels.length - 1;
      const bitmap = await createImageBitmap(
        await payloadStore(this.map.backend).get(
          this.map.id,
          tileKey(index, 0, 0),
        ),
      );
      if (this.disposed) bitmap.close();
      else {
        this.base = bitmap;
        this.invalidate();
      }
    } catch {
      if (!this.disposed)
        this.onError("The map preview is missing. Reimport this map.");
    }
  }
  private setCamera(camera: Camera) {
    const { min, max } = this.limits(camera.rotation ?? 0);
    this.camera = constrain(
      { ...camera, scale: Math.max(min, Math.min(max, camera.scale)) },
      this.map,
      this.viewport(),
    );
    this.navigation.view = captureView(this.camera, this.viewport());
    this.options?.onView();
    this.onZoom(Math.round(this.camera.scale * 100));
    this.invalidate();
  }
  fit(animated = true) {
    if (this.navigation.touchLocked && animated) return;
    this.interactions?.reset();
    const camera = fitCamera(
      this.map,
      this.viewport(),
      this.camera.rotation ?? 0,
    );
    if (animated) this.animate(camera);
    else this.setCamera(camera);
  }
  setTool(tool: Tool) {
    this.interactions.reset();
    this.tool = tool;
  }
  updateNavigation(state: NavigationState) {
    this.interactions.reset();
    this.navigation = state;
    this.overlay?.rebuild(state);
    this.applyAppearance();
    this.invalidate();
  }
  private applyAppearance() {
    this.canvas.style.filter = `${this.navigation.inverted ? "invert(1) " : ""}brightness(${this.navigation.dimming})`;
    if (this.options)
      this.options.overlay.style.opacity = String(
        Math.max(0.5, this.navigation.dimming),
      );
  }
  zoomBy(factor: number) {
    if (this.navigation.touchLocked) return;
    this.interactions.reset();
    const { min, max } = this.limits();
    this.animate(
      zoomAt(
        this.camera,
        Math.max(min, Math.min(max, this.camera.scale * factor)),
        this.width / 2,
        this.height / 2,
      ),
    );
  }
  panBy(x: number, y: number) {
    if (this.navigation.touchLocked) return;
    this.interactions.reset();
    this.setCamera({
      ...this.camera,
      x: this.camera.x + x,
      y: this.camera.y + y,
    });
  }
  rotateTo(rotation: number) {
    if (this.navigation.touchLocked || this.navigation.rotationLocked) return;
    this.interactions.reset();
    this.setCamera(
      transformAt(this.camera, this.camera.scale, rotation, {
        x: this.width / 2,
        y: this.height / 2,
      }),
    );
  }
  jumpTo(point: Point) {
    if (this.navigation.touchLocked) return;
    this.interactions.reset();
    this.setCamera(
      cameraAt(
        point,
        this.viewport(),
        Math.max(this.camera.scale, 0.2),
        this.camera.rotation ?? 0,
      ),
    );
  }
  centerPoint() {
    return screenToWorld(this.camera, {
      x: this.width / 2,
      y: this.height / 2,
    });
  }
  private tap(screen: Point) {
    const point = screenToWorld(this.camera, screen);
    if (!insideImage(point, this.map)) return this.tool !== "browse";
    if (this.tool !== "browse") {
      this.options?.onTap(point);
      return true;
    }
    const marker = this.navigation.markers.find((marker) => {
      const p = worldToScreen(this.camera, marker.point);
      return Math.hypot(p.x - screen.x, p.y - screen.y) < 22;
    });
    if (marker) {
      this.options?.onMarker(marker);
      return true;
    }
    return false;
  }
  private stopAnimation() {
    cancelAnimationFrame(this.animation);
    this.animation = 0;
  }
  private animate(target: Camera) {
    this.stopAnimation();
    target = constrain(target, this.map, this.viewport());
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.setCamera(target);
      return;
    }
    const start = { ...this.camera },
      startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / 240),
        ease = 1 - (1 - t) ** 3;
      const scale = Math.exp(
        Math.log(start.scale) +
          (Math.log(target.scale) - Math.log(start.scale)) * ease,
      );
      // Preserve the zoom anchor throughout the animation, not just at its end.
      const ratio = target.scale / start.scale;
      const anchorX =
        Math.abs(1 - ratio) > 0.00001
          ? (target.x - start.x * ratio) / (1 - ratio)
          : this.width / 2;
      const anchorY =
        Math.abs(1 - ratio) > 0.00001
          ? (target.y - start.y * ratio) / (1 - ratio)
          : this.height / 2;
      this.setCamera(
        Math.abs(1 - ratio) > 0.00001
          ? zoomAt(start, scale, anchorX, anchorY)
          : {
              ...start,
              scale,
              x: start.x + (target.x - start.x) * ease,
              y: start.y + (target.y - start.y) * ease,
            },
      );
      if (t < 1) this.animation = requestAnimationFrame(tick);
      else this.setCamera(target);
    };
    this.animation = requestAnimationFrame(tick);
  }
  private invalidate() {
    if (!this.frame && !this.disposed)
      this.frame = requestAnimationFrame((now) => {
        this.frame = 0;
        this.draw(now);
      });
  }
  private draw(now: number) {
    const ctx = this.canvas.getContext("2d", { alpha: false })!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.navigation.inverted ? "#efe9eb" : "#101614";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(this.camera.x, this.camera.y);
    ctx.rotate(this.camera.rotation ?? 0);
    ctx.scale(this.camera.scale, this.camera.scale);
    ctx.fillStyle = this.navigation.inverted ? "#d9ced3" : "#26312c";
    ctx.fillRect(0, 0, this.map.width, this.map.height);
    if (this.base)
      ctx.drawImage(this.base, 0, 0, this.map.width, this.map.height);
    let level = chooseLevel(this.map.levels, this.camera.scale, this.dpr);
    let tiles = visibleTiles(
      this.map.levels[level]!,
      this.camera,
      this.viewport(),
    );
    // Keep all visible tiles within the decoded-byte budget, including edge tiles.
    while (tiles.length > 22 && level < this.map.levels.length - 1)
      tiles = visibleTiles(
        this.map.levels[++level]!,
        this.camera,
        this.viewport(),
      );
    this.cache.plan(tiles.map((t) => ({ ...t, level })));
    const entries = this.cache.tiles
      .filter((t) => t.level >= level)
      .sort((a, b) => b.level - a.level);
    for (const tile of entries) {
      const scale = this.map.levels[tile.level]!.scale;
      ctx.imageSmoothingEnabled = this.camera.scale * scale * this.dpr < 1;
      const x = tile.x * TILE_SIZE * scale,
        y = tile.y * TILE_SIZE * scale;
      const width = Math.min(tile.bitmap.width * scale, this.map.width - x),
        height = Math.min(tile.bitmap.height * scale, this.map.height - y);
      // Clip rounded pyramid edges; level dimensions are ceil(original / scale).
      ctx.drawImage(
        tile.bitmap,
        0,
        0,
        width / scale,
        height / scale,
        x,
        y,
        width,
        height,
      );
    }
    this.overlay?.draw(this.camera, this.viewport());
    if (this.lastFrame && now - this.lastFrame < 100) {
      this.frameTimes.push(now - this.lastFrame);
      if (this.frameTimes.length > 120) this.frameTimes.shift();
    }
    this.lastFrame = now;
    this.frames++;
  }
  // Useful for device profiling; byte counts exclude browser/GPU/encoder overhead.
  diagnostics() {
    return {
      decodedTileBytes: this.cache.decodedBytes,
      canvasBytes: this.canvas.width * this.canvas.height * 4,
      overviewBytes: this.base ? this.base.width * this.base.height * 4 : 0,
      queuedTiles: this.cache.queued,
      renderedFrames: this.frames,
      activeFrameFps: this.frameTimes.length
        ? 1000 /
          (this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length)
        : null,
      zoom: this.camera.scale,
      rotation: this.camera.rotation ?? 0,
      inverted: this.navigation.inverted,
      touchLocked: this.navigation.touchLocked,
    };
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.stopAnimation();
    this.controller.abort();
    this.observer.disconnect();
    this.interactions.dispose();
    this.cache.dispose();
    this.base?.close();
    this.overlay?.dispose();
    this.canvas.width = this.canvas.height = 1;
  }
}
