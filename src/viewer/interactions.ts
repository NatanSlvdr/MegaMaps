import { zoomAt, transformAt, type Camera, type Point } from "./camera";
interface Pointer extends Point {
  start: Point;
  moved: boolean;
}
interface InteractionHost {
  getCamera(): Camera;
  setCamera(camera: Camera): void;
  limits(): { min: number; max: number };
  animate(camera: Camera): void;
  stopAnimation(): void;
  locked?(): boolean;
  rotationLocked?(): boolean;
  editing?(): boolean;
  tap?(point: Point): boolean;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
export function attachInteractions(
  canvas: HTMLCanvasElement,
  host: InteractionHost,
) {
  const controller = new AbortController(),
    { signal } = controller;
  const points = new Map<number, Pointer>();
  let velocity = { x: 0, y: 0 },
    lastMove = 0,
    inertia = 0,
    lastTap = { time: 0, x: 0, y: 0 },
    hadPinch = false;
  const point = (event: PointerEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const clampScale = (scale: number) => {
    const { min, max } = host.limits();
    return Math.max(min, Math.min(max, scale));
  };
  function stop() {
    cancelAnimationFrame(inertia);
    inertia = 0;
    host.stopAnimation();
  }
  function doubleZoom(p: Point) {
    if (host.locked?.() || host.editing?.()) return;
    stop();
    const camera = host.getCamera(),
      { min } = host.limits();
    const target =
      camera.scale >= Math.max(1, min * 8)
        ? min
        : clampScale(camera.scale * 2.5);
    host.animate(zoomAt(camera, target, p.x, p.y));
  }
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (
        host.locked?.() ||
        (event.pointerType === "mouse" && event.button !== 0)
      )
        return;
      stop();
      canvas.setPointerCapture(event.pointerId);
      const p = point(event);
      points.set(event.pointerId, { ...p, start: p, moved: false });
      if (points.size === 1) hadPinch = false;
      if (points.size > 1) {
        hadPinch = true;
        lastTap.time = 0;
      }
      velocity = { x: 0, y: 0 };
      lastMove = performance.now();
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (host.locked?.()) return;
      const old = points.get(event.pointerId);
      if (!old) return;
      const before = [...points.values()],
        p = point(event);
      // Fingers wobble; a small slop keeps taps (route points) from becoming pans.
      const slop = event.pointerType === "mouse" ? 4 : 10;
      const moved = old.moved || distance(old.start, p) > slop;
      if (moved) lastTap.time = 0;
      points.set(event.pointerId, { ...p, start: old.start, moved });
      const after = [...points.values()];
      const camera = host.getCamera();
      if (before.length >= 2) {
        const c0 = midpoint(before[0]!, before[1]!),
          c1 = midpoint(after[0]!, after[1]!);
        const ratio =
          distance(after[0]!, after[1]!) /
          Math.max(1, distance(before[0]!, before[1]!));
        const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
        const delta =
          angle(after[0]!, after[1]!) - angle(before[0]!, before[1]!);
        const rotation =
          (camera.rotation ?? 0) +
          (host.rotationLocked?.() === false
            ? Math.atan2(Math.sin(delta), Math.cos(delta))
            : 0);
        const zoomed = transformAt(
          camera,
          clampScale(camera.scale * ratio),
          rotation,
          c0,
        );
        host.setCamera({
          ...zoomed,
          x: zoomed.x + c1.x - c0.x,
          y: zoomed.y + c1.y - c0.y,
        });
        velocity = { x: 0, y: 0 };
      } else {
        const dx = p.x - old.x,
          dy = p.y - old.y,
          elapsed = Math.max(4, performance.now() - lastMove);
        velocity = {
          x: velocity.x * 0.3 + (dx / elapsed) * 0.7,
          y: velocity.y * 0.3 + (dy / elapsed) * 0.7,
        };
        host.setCamera({ ...camera, x: camera.x + dx, y: camera.y + dy });
      }
      lastMove = performance.now();
    },
    { signal },
  );
  const release = (event: PointerEvent) => {
    const pointer = points.get(event.pointerId);
    if (!pointer) return;
    points.delete(event.pointerId);
    if (event.type === "pointercancel" || event.type === "lostpointercapture") {
      lastTap.time = 0;
      velocity = { x: 0, y: 0 };
      return;
    }
    if (host.locked?.()) return;
    if (!points.size && !pointer.moved && !hadPinch && host.tap?.(pointer)) {
      lastTap.time = 0;
      return;
    }
    if (!pointer.moved && !hadPinch && event.pointerType !== "mouse") {
      const now = performance.now();
      if (now - lastTap.time < 320 && distance(lastTap, pointer) < 32) {
        doubleZoom(pointer);
        lastTap.time = 0;
      } else lastTap = { ...pointer, time: now };
    }
    if (
      points.size ||
      hadPinch ||
      !pointer.moved ||
      performance.now() - lastMove > 80
    )
      return;
    let time = performance.now();
    const tick = (now: number) => {
      if (document.hidden) {
        stop();
        return;
      }
      const dt = Math.min(32, now - time);
      time = now;
      const camera = host.getCamera();
      host.setCamera({
        ...camera,
        x: camera.x + velocity.x * dt,
        y: camera.y + velocity.y * dt,
      });
      velocity.x *= Math.exp(-dt / 240);
      velocity.y *= Math.exp(-dt / 240);
      if (Math.hypot(velocity.x, velocity.y) > 0.02)
        inertia = requestAnimationFrame(tick);
    };
    inertia = requestAnimationFrame(tick);
  };
  for (const event of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const)
    canvas.addEventListener(event, release, { signal });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (host.locked?.()) return;
      stop();
      const p = point(event),
        camera = host.getCamera();
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? canvas.clientHeight
            : 1);
      host.setCamera(
        zoomAt(
          camera,
          clampScale(
            camera.scale * Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002)),
          ),
          p.x,
          p.y,
        ),
      );
    },
    { signal, passive: false },
  );
  canvas.addEventListener(
    "dblclick",
    (event) => {
      event.preventDefault();
      doubleZoom(point(event));
    },
    { signal },
  );
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), {
    signal,
  });
  return {
    stop,
    reset() {
      stop();
      points.clear();
      lastTap.time = 0;
    },
    dispose() {
      stop();
      controller.abort();
    },
  };
}
