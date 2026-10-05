import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { ViewerControls } from "../src/ui/viewer-controls";
import { viewerMarkup } from "../src/ui/viewer-markup";
import { defaultNavigation } from "../src/viewer/navigation";
import { saveMap } from "../src/storage/database";
import { loadNavigation } from "../src/storage/navigation";
import type { MapRecord } from "../src/types";

test("cave controls invert, lock rotation, create/edit landmarks, record checkpoints, finish routes and hold-unlock", async () => {
  const { window, document } = parseHTML(
    `<html><body><section id="viewer">${viewerMarkup}</section></body></html>`,
  );
  Object.defineProperty(globalThis, "document", {
    value: document,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: window,
    configurable: true,
  });
  // Linkedom supplies DOM/events but not native modal-dialog behavior or select setters.
  for (const dialog of document.querySelectorAll("dialog")) {
    Object.defineProperty(dialog, "showModal", {
      value: () => dialog.setAttribute("open", ""),
    });
    Object.defineProperty(dialog, "close", {
      value: () => dialog.removeAttribute("open"),
    });
  }
  const select = document.querySelector<HTMLSelectElement>("#marker-kind")!;
  let kind = "bookmark";
  Object.defineProperty(select, "value", {
    get: () => kind,
    set: (value: string) => {
      kind = value;
    },
  });
  const root = document.querySelector<HTMLElement>("#viewer")!;
  const map: MapRecord = {
    id: "controls",
    name: "cave.png",
    width: 9000,
    height: 9000,
    bytes: 1,
    backend: "indexeddb",
    created: 0,
    status: "ready",
    levels: [],
  };
  await saveMap(map);
  const state = defaultNavigation("controls");
  const changes: number[] = [];
  let rotation = 0;
  const controls = new ViewerControls(root, map, state, () => {});
  const commands = {
    setTool() {},
    updateNavigation() {},
    zoomBy() {},
    panBy() {},
    rotateTo(value: number) {
      rotation = value;
    },
    jumpTo() {},
    centerPoint: () => ({ x: 500, y: 600 }),
    fit() {},
  };
  controls.attach(commands);
  const click = (id: string) =>
    document.getElementById(id)!.dispatchEvent(new window.Event("click"));
  const change = (id: string) =>
    document.getElementById(id)!.dispatchEvent(new window.Event("change"));
  const submit = (id: string) =>
    document
      .getElementById(id)!
      .dispatchEvent(new window.Event("submit", { cancelable: true }));
  const input = (id: string, value: string) =>
    ((document.getElementById(id)! as HTMLInputElement).value = value);
  try {
    click("quick-invert");
    assert.equal(state.inverted, true);
    assert.equal(
      document.getElementById("quick-invert")!.getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      (document.getElementById("rotate-left")! as HTMLButtonElement).disabled,
      true,
    );
    (document.getElementById("rotation-lock")! as HTMLInputElement).checked =
      false;
    change("rotation-lock");
    click("rotate-right");
    assert.ok(Math.abs(rotation - Math.PI / 12) < 1e-9);
    click("add-marker");
    controls.options().onTap({ x: 500, y: 600 });
    input("marker-label", "<Entrance>");
    kind = "entrance";
    input("marker-note", "Left opening");
    submit("marker-form");
    assert.equal(state.markers[0]?.label, "<Entrance>");
    assert.equal(state.markers[0]?.kind, "entrance");
    controls.options().onMarker(state.markers[0]!);
    input("marker-note", "Updated note");
    submit("marker-form");
    assert.equal(state.markers[0]?.note, "Updated note");
    assert.equal(state.markers.length, 1);
    click("set-position");
    controls.options().onTap({ x: 800, y: 900 });
    assert.deepEqual(state.position?.point, { x: 800, y: 900 });
    click("add-checkpoint");
    controls.options().onTap({ x: 900, y: 1000 });
    input("name-input", "Recognized junction");
    submit("name-form");
    assert.equal(state.checkpoints.length, 1);
    assert.ok(state.checkpoints[0]!.confirmed > 0);
    assert.deepEqual(state.position?.point, { x: 900, y: 1000 });
    click("add-route");
    input("name-input", "Exit plan");
    submit("name-form");
    controls.options().onTap({ x: 900, y: 1000 });
    controls.options().onTap({ x: 1500, y: 1700 });
    click("route-undo");
    assert.equal(state.routes[0]?.points.length, 1);
    controls.options().onTap({ x: 1400, y: 1600 });
    click("route-finish");
    assert.equal(state.routes[0]?.draft, false);
    await controls.flush();
    assert.equal(
      (await loadNavigation("controls")).routes[0]?.name,
      "Exit plan",
    );
    click("touch-lock");
    assert.equal(state.touchLocked, true);
    assert.equal(
      (document.getElementById("quick-invert")! as HTMLButtonElement).disabled,
      true,
    );
    const unlock = document.getElementById("unlock-view")!;
    const press = () => {
      const event = new window.Event("keydown", { cancelable: true });
      Object.defineProperty(event, "key", { value: "Enter" });
      unlock.dispatchEvent(event);
    };
    press();
    await new Promise((resolve) => setTimeout(resolve, 20));
    unlock.dispatchEvent(new window.Event("keyup"));
    assert.equal(state.touchLocked, true);
    press();
    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.equal(state.touchLocked, false);
    changes.push(state.checkpoints.length);
    assert.deepEqual(changes, [1]);
  } finally {
    controls.dispose();
    await controls.flush();
  }
});
