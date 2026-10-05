import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { ViewerControls } from "../src/ui/viewer-controls";
import { viewerMarkup } from "../src/ui/viewer-markup";
import { defaultNavigation } from "../src/viewer/navigation";
import { saveMap } from "../src/storage/database";
import { loadNavigation } from "../src/storage/navigation";
import type { Point } from "../src/viewer/camera";
import type { MapRecord } from "../src/types";

test("viewer controls: sheets, smart dark, layers, highlight, places, checkpoints, routes and hold-unlock", async () => {
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
  // Linkedom supplies DOM/events but not native modal-dialog behavior.
  for (const dialog of document.querySelectorAll("dialog")) {
    Object.defineProperty(dialog, "showModal", {
      value: () => dialog.setAttribute("open", ""),
    });
    Object.defineProperty(dialog, "close", {
      value: () => dialog.removeAttribute("open"),
    });
  }
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
  let rotation = 0,
    fitted = 0;
  const tools: string[] = [],
    framed: Point[][] = [],
    jumps: Point[] = [];
  const controls = new ViewerControls(root, map, state, () => {});
  controls.attach({
    setTool(tool: string) {
      tools.push(tool);
    },
    updateNavigation() {},
    zoomBy() {},
    panBy() {},
    rotateTo(value: number) {
      rotation = value;
    },
    jumpTo(point: Point) {
      jumps.push(point);
    },
    fitPoints(points: Point[]) {
      framed.push(points);
    },
    centerPoint: () => ({ x: 500, y: 600 }),
    fit() {
      fitted++;
    },
  });
  const el = (id: string) => document.getElementById(id)!;
  const click = (id: string) => el(id).dispatchEvent(new window.Event("click"));
  const change = (id: string) =>
    el(id).dispatchEvent(new window.Event("change"));
  const submit = (id: string) =>
    el(id).dispatchEvent(new window.Event("submit", { cancelable: true }));
  const input = (id: string, value: string) =>
    ((el(id) as HTMLInputElement).value = value);
  const check = (id: string, value: boolean) => {
    (el(id) as HTMLInputElement).checked = value;
    change(id);
  };
  const key = (target: EventTarget, name: string) => {
    const event = new window.Event("keydown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "key", { value: name });
    target.dispatchEvent(event);
  };
  const tap = (x: number, y: number) => controls.options().onTap({ x, y });
  const sheet = el("sheet"),
    dock = el("dock"),
    toolBar = el("tool-bar"),
    stage = el("map-stage");
  try {
    // Browsing: dock + zoom rail, no sheet.
    assert.equal(sheet.hidden, true);
    assert.equal(dock.hidden, false);
    assert.equal(el("zoom-rail").hidden, false);
    assert.equal(toolBar.hidden, true);
    assert.equal(root.dataset.tool, "browse");

    // Sheets open from the dock, toggle, and close with backdrop/Escape.
    click("open-more");
    assert.equal(sheet.hidden, false);
    assert.equal(el("sheet-more").hidden, false);
    assert.equal(el("sheet-add").hidden, true);
    assert.equal(el("sheet-title").textContent, "More");
    assert.equal(el("open-more").getAttribute("aria-expanded"), "true");
    assert.equal(dock.hidden, true);
    // Fit lives here, not on the main controls.
    click("fit");
    assert.equal(fitted, 1);
    assert.equal(sheet.hidden, true);
    click("open-display");
    assert.equal(el("sheet-title").textContent, "Map display");
    click("open-display");
    assert.equal(sheet.hidden, true);
    click("open-saved");
    key(root, "Escape");
    assert.equal(sheet.hidden, true);
    assert.equal(controls.escape(), false, "nothing left to back out of");
    click("open-add");
    click("sheet-dismiss");
    assert.equal(sheet.hidden, true);

    // Smart dark mode is on by default and set from Map display.
    assert.equal(state.inverted, true);
    assert.equal((el("dark-map") as HTMLInputElement).checked, true);
    controls.options().onAppearance?.({
      filter: "",
      black: "#000",
      kind: "already-dark",
    });
    assert.equal(el("dark-status").textContent, "Map is already dark");
    check("dark-map", false);
    assert.equal(state.inverted, false);
    assert.equal(el("dark-status").textContent, "Off: original colors");
    check("dark-map", true);
    assert.equal(state.inverted, true);

    // The compass only appears once the map is rotated, and resets it.
    assert.equal(el("compass").hidden, true);
    state.view = { center: { x: 0, y: 0 }, scale: 1, rotation: Math.PI / 2 };
    controls.options().onView();
    assert.equal(el("compass").hidden, false);
    rotation = 1;
    click("compass");
    assert.equal(rotation, 0);
    state.view.rotation = 0;
    controls.options().onView();
    assert.equal(el("compass").hidden, true);

    // Locate without a position starts setting one.
    assert.equal(el("locate").getAttribute("aria-label"), "Set my position");
    click("locate");
    assert.equal(root.dataset.tool, "position");
    key(root, "Escape");
    assert.equal(root.dataset.tool, "browse");

    // Rotation buttons follow the lock.
    assert.equal((el("rotate-left") as HTMLButtonElement).disabled, true);
    check("rotation-lock", false);
    click("rotate-right");
    assert.ok(Math.abs(rotation - Math.PI / 12) < 1e-9);

    // Highlight with nothing saved explains instead of animating.
    click("spotlight");
    assert.equal(stage.classList.contains("spotlight"), false);
    assert.match(el("toast").textContent!, /Nothing saved/);

    // Places: auto name follows kind until edited.
    click("open-add");
    click("add-marker");
    assert.equal(sheet.hidden, true);
    assert.equal(dock.hidden, true);
    assert.equal(toolBar.hidden, false);
    assert.equal(el("placement-center").hidden, false);
    assert.equal(root.dataset.tool, "marker");
    click("tool-center");
    assert.equal(el("marker-dialog").hasAttribute("open"), true);
    assert.equal((el("marker-label") as HTMLInputElement).value, "Landmark 1");
    const entrance = root.querySelector<HTMLInputElement>(
      'input[name="marker-kind"][value="entrance"]',
    )!;
    // Linkedom has no radio-group exclusivity; mimic the browser.
    for (const radio of root.querySelectorAll<HTMLInputElement>(
      'input[name="marker-kind"]',
    ))
      radio.checked = radio === entrance;
    entrance.dispatchEvent(new window.Event("change"));
    assert.equal((el("marker-label") as HTMLInputElement).value, "Entrance 1");
    input("marker-label", "<Entrance>");
    input("marker-note", "Left opening");
    submit("marker-form");
    assert.equal(state.markers[0]?.label, "<Entrance>");
    assert.equal(state.markers[0]?.kind, "entrance");
    assert.deepEqual(state.markers[0]?.point, { x: 500, y: 600 });
    assert.equal(toolBar.hidden, true);
    assert.equal(dock.hidden, false);
    controls.options().onMarker(state.markers[0]!);
    assert.equal(entrance.checked, true);
    assert.equal(el("marker-delete").hidden, false);
    input("marker-note", "Updated note");
    submit("marker-form");
    assert.equal(state.markers[0]?.note, "Updated note");
    assert.equal(state.markers.length, 1);
    // Saved list renders names as text, never markup.
    assert.match(el("marker-list").textContent!, /<Entrance>/);
    assert.equal(el("saved-places-count").textContent, "1");

    // Position and checkpoints.
    click("set-position");
    tap(800, 900);
    assert.deepEqual(state.position?.point, { x: 800, y: 900 });
    click("add-checkpoint");
    tap(900, 1000);
    assert.equal((el("name-input") as HTMLInputElement).value, "Checkpoint 1");
    input("name-input", "Recognized junction");
    submit("name-form");
    assert.equal(state.checkpoints.length, 1);
    assert.ok(state.checkpoints[0]!.confirmed > 0);
    assert.deepEqual(state.position?.point, { x: 900, y: 1000 });

    // Routes start drawing immediately; Done needs two points.
    click("add-route");
    assert.equal(tools.at(-1), "route");
    assert.equal(state.routes.length, 1);
    assert.equal(state.routes[0]?.name, "Route 1");
    assert.equal(el("tool-done").textContent, "Cancel");
    assert.equal((el("route-undo") as HTMLButtonElement).disabled, true);
    tap(900, 1000);
    tap(1500, 1700);
    assert.equal(el("tool-done").classList.contains("ready"), true);
    click("route-undo");
    assert.equal(state.routes[0]?.points.length, 1);
    assert.equal(el("tool-done").textContent, "Cancel");
    tap(1400, 1600);
    assert.match(el("tool-title").textContent!, /Route 1 · 2 points/);
    click("tool-done");
    assert.equal(state.routes[0]?.draft, false);
    assert.equal(toolBar.hidden, true);
    assert.equal(tools.at(-1), "browse");

    // Editing a finished route down to one point restores it.
    const editButton = [...el("route-list").querySelectorAll("button")].find(
      (b) => b.textContent === "Edit points",
    )!;
    editButton.dispatchEvent(new window.Event("click"));
    click("route-undo");
    assert.equal(state.routes[0]?.points.length, 1);
    key(root, "Escape");
    assert.equal(state.routes[0]?.points.length, 2);
    assert.equal(state.routes[0]?.draft, false);

    // A new route with a single point is discarded.
    click("add-route");
    tap(100, 100);
    click("tool-done");
    assert.equal(state.routes.length, 1);
    assert.match(el("toast").textContent!, /discarded/);

    // Saved route rows frame the route.
    el("route-list")
      .querySelector<HTMLButtonElement>(".navigation-jump")!
      .dispatchEvent(new window.Event("click"));
    assert.deepEqual(framed.at(-1), state.routes[0]!.points);

    // Rename via the name dialog, delete needs two taps.
    const rowButton = (label: RegExp) =>
      [...el("route-list").querySelectorAll("button")].find((b) =>
        label.test(b.textContent!),
      )!;
    rowButton(/Rename/).dispatchEvent(new window.Event("click"));
    input("name-input", "Exit plan");
    submit("name-form");
    assert.equal(state.routes[0]?.name, "Exit plan");
    await controls.flush();
    assert.equal(
      (await loadNavigation("controls")).routes[0]?.name,
      "Exit plan",
    );
    rowButton(/^Delete$/).dispatchEvent(new window.Event("click"));
    assert.equal(state.routes.length, 1);
    rowButton(/Tap again/).dispatchEvent(new window.Event("click"));
    assert.equal(state.routes.length, 0);

    // Layers hide/show and the highlight briefly reveals everything.
    assert.equal(el("layer-places-count").textContent, "1");
    check("layer-places", false);
    assert.equal(state.layers.places, false);
    click("spotlight");
    assert.equal(stage.classList.contains("spotlight"), true);
    assert.equal(el("spotlight").classList.contains("active"), true);

    // Locate jumps to the saved estimate; long-press drops a place.
    assert.equal(el("locate").getAttribute("aria-label"), "Go to my position");
    click("locate");
    assert.deepEqual(jumps.at(-1), state.position!.point);
    controls.options().onLongPress?.({ x: 2000, y: 2100 });
    assert.equal(el("marker-dialog").hasAttribute("open"), true);
    assert.equal((el("marker-label") as HTMLInputElement).value, "Landmark 2");
    submit("marker-form");
    assert.deepEqual(state.markers.at(-1)?.point, { x: 2000, y: 2100 });

    // Touch lock hides everything except the hold-to-unlock bar.
    click("touch-lock");
    assert.equal(state.touchLocked, true);
    assert.equal(dock.hidden, true);
    assert.equal(el("zoom-rail").hidden, true);
    assert.equal(el("touch-locked").hidden, false);
    assert.equal((el("dark-map") as HTMLInputElement).disabled, true);
    click("open-more");
    assert.equal(sheet.hidden, true, "sheets stay closed while locked");
    const unlock = el("unlock-view");
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
    assert.equal(dock.hidden, false);
  } finally {
    controls.dispose();
    await controls.flush();
  }
  assert.equal(stage.classList.contains("spotlight"), false);
});
