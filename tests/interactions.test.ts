import test from "node:test";
import assert from "node:assert/strict";
import { attachInteractions } from "../src/viewer/interactions";
import { screenToWorld, type Camera } from "../src/viewer/camera";
class Canvas extends EventTarget {
  clientHeight = 844;
  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }
  setPointerCapture() {}
}
function emit(
  canvas: Canvas,
  type: string,
  properties: Record<string, number | string>,
) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  canvas.dispatchEvent(event);
}
function host(canvas: Canvas) {
  let camera: Camera = { x: 0, y: 0, scale: 1 };
  let locked = false,
    rotationLocked = true,
    editing = false,
    taps = 0,
    animations = 0;
  const interactions = attachInteractions(
    canvas as unknown as HTMLCanvasElement,
    {
      getCamera: () => camera,
      setCamera: (value) => {
        camera = value;
      },
      limits: () => ({ min: 0.01, max: 4 }),
      animate: (value) => {
        camera = value;
        animations++;
      },
      stopAnimation() {},
      locked: () => locked,
      rotationLocked: () => rotationLocked,
      editing: () => editing,
      tap: () => {
        if (editing) {
          taps++;
          return true;
        }
        return false;
      },
    },
  );
  return {
    interactions,
    camera: () => camera,
    setLock: (value: boolean) => {
      locked = value;
      interactions.reset();
    },
    setRotationLock: (value: boolean) => {
      rotationLocked = value;
    },
    setEditing: (value: boolean) => {
      editing = value;
    },
    taps: () => taps,
    animations: () => animations,
  };
}
const pointer = (id: number, x: number, y: number) => ({
  pointerId: id,
  clientX: x,
  clientY: y,
  pointerType: "touch",
  button: 0,
});
test("pinch rotation respects its lock and preserves the moving gesture anchor", () => {
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    value: () => {},
    configurable: true,
  });
  for (const locked of [true, false]) {
    const canvas = new Canvas(),
      h = host(canvas);
    h.setRotationLock(locked);
    const world = screenToWorld(h.camera(), { x: 150, y: 100 });
    emit(canvas, "pointerdown", pointer(1, 100, 100));
    emit(canvas, "pointerdown", pointer(2, 200, 100));
    emit(canvas, "pointermove", pointer(2, 100, 200));
    assert.ok(
      Math.abs((h.camera().rotation ?? 0) - (locked ? 0 : Math.PI / 2)) < 1e-9,
    );
    const after = screenToWorld(h.camera(), { x: 100, y: 150 });
    assert.ok(
      Math.abs(world.x - after.x) < 1e-9 && Math.abs(world.y - after.y) < 1e-9,
    );
    h.interactions.dispose();
  }
});
test("touch lock blocks dragging, wheel and double zoom; edit taps never double-zoom", () => {
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    value: () => {},
    configurable: true,
  });
  const canvas = new Canvas(),
    h = host(canvas);
  h.setLock(true);
  emit(canvas, "pointerdown", pointer(1, 100, 100));
  emit(canvas, "pointermove", pointer(1, 200, 200));
  emit(canvas, "pointerup", pointer(1, 200, 200));
  emit(canvas, "wheel", {
    clientX: 100,
    clientY: 100,
    deltaY: -100,
    deltaMode: 0,
  });
  emit(canvas, "dblclick", { clientX: 100, clientY: 100 });
  assert.deepEqual(h.camera(), { x: 0, y: 0, scale: 1 });
  assert.equal(h.animations(), 0);
  h.setLock(false);
  h.setEditing(true);
  for (let i = 0; i < 2; i++) {
    emit(canvas, "pointerdown", pointer(1, 150, 150));
    emit(canvas, "pointerup", pointer(1, 150, 150));
  }
  assert.equal(h.taps(), 2);
  assert.equal(h.animations(), 0);
  h.interactions.dispose();
});
