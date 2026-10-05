import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createCanvas } from "@napi-rs/canvas";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Viewer } from "../src/viewer/viewer";
import { defaultNavigation } from "../src/viewer/navigation";
import { payloadStore } from "../src/storage/payloads";
import { installPlatform, nativeStats } from "./node-platform";
import { tileKey, type MapRecord } from "../src/types";

test("renderer restores a rotated view, inverts only the map, keeps margins dark, and blocks locked controls", async () => {
  const root = await mkdtemp(join(tmpdir(), "map-viewer-renderer-"));
  await installPlatform(root);
  const { window, document } = parseHTML(
    "<html><body><canvas></canvas><svg></svg></body></html>",
  );
  Object.defineProperty(globalThis, "document", {
    value: document,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: window,
    configurable: true,
  });
  window.matchMedia = () => ({ matches: false }) as MediaQueryList;
  window.devicePixelRatio = 1;
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
    },
  });
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (id: number) => frames.delete(id),
  });
  const step = (time = performance.now()) => {
    const batch = [...frames];
    frames.clear();
    for (const [, callback] of batch) callback(time);
  };
  const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
  const backing = createCanvas(390, 844);
  Object.defineProperties(canvas, {
    clientWidth: { value: 390 },
    clientHeight: { value: 844 },
    width: {
      get: () => backing.width,
      set: (value: number) => {
        backing.width = value;
      },
    },
    height: {
      get: () => backing.height,
      set: (value: number) => {
        backing.height = value;
      },
    },
    getContext: { value: () => backing.getContext("2d") },
  });
  const tile = createCanvas(512, 512);
  tile.getContext("2d").fillStyle = "#ffffff";
  tile.getContext("2d").fillRect(0, 0, 512, 512);
  const map: MapRecord = {
    id: "renderer",
    name: "cave.png",
    width: 512,
    height: 512,
    backend: "indexeddb",
    bytes: 1,
    status: "ready",
    created: 0,
    levels: [{ width: 512, height: 512, scale: 1, cols: 1, rows: 1 }],
  };
  await payloadStore("indexeddb").put(
    map.id,
    tileKey(0, 0, 0),
    new Blob([new Uint8Array(await tile.encode("png"))]),
  );
  const state = defaultNavigation(map.id);
  state.inverted = true;
  state.dimming = 0.4;
  state.view = {
    center: { x: 256, y: 256 },
    scale: 0.5,
    rotation: Math.PI / 2,
  };
  state.markers.push({
    id: "entrance",
    label: "<Entrance>",
    kind: "entrance",
    note: "",
    point: { x: 256, y: 256 },
    created: 0,
  });
  const overlay = document.querySelector<SVGSVGElement>("svg")!;
  const errors: string[] = [];
  const viewer = new Viewer(
    canvas,
    map,
    () => {},
    (error) => errors.push(error),
    { navigation: state, overlay, onView() {}, onTap() {}, onMarker() {} },
  );
  try {
    assert.equal(canvas.style.filter, "invert(1) brightness(0.4)");
    assert.equal(overlay.style.filter, "");
    step();
    // CSS inversion turns this compensated margin into the original dark background.
    assert.deepEqual(
      [...backing.getContext("2d").getImageData(0, 0, 1, 1).data],
      [239, 233, 235, 255],
    );
    assert.equal(overlay.querySelector("text")!.textContent, "<Entrance>");
    assert.equal(
      overlay.querySelector("text")!.getAttribute("fill"),
      "#c5e6a5",
    );
    assert.match(
      overlay.querySelector("g")!.getAttribute("transform")!,
      /translate\(195,422\)/,
    );
    assert.equal(viewer.diagnostics().rotation, Math.PI / 2);
    viewer.rotateTo(0); // Default map rotation lock also blocks explicit controls.
    assert.equal(viewer.diagnostics().rotation, Math.PI / 2);
    viewer.fit();
    step(performance.now() + 100);
    assert.equal(viewer.diagnostics().rotation, Math.PI / 2);
    step(performance.now() + 300);
    viewer.fit(); // Fitting an already-fitted rotated map must keep its angle mid-animation.
    step(performance.now() + 100);
    assert.equal(viewer.diagnostics().rotation, Math.PI / 2);
    step(performance.now() + 300);
    state.touchLocked = true;
    viewer.updateNavigation(state);
    const saved = structuredClone(state.view);
    viewer.panBy(60, 0);
    viewer.zoomBy(2);
    viewer.fit();
    assert.deepEqual(state.view, saved);
    state.inverted = false;
    viewer.updateNavigation(state);
    assert.equal(canvas.style.filter, "brightness(0.4)");
  } finally {
    viewer.dispose();
    // Settle already-started bitmap loads, which must close after disposal.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(errors, []);
    assert.equal(nativeStats.decodedBytes, 0);
    await rm(root, { recursive: true, force: true });
  }
});
