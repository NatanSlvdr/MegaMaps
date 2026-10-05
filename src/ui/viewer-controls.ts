import type { MapRecord } from "../types";
import type { Point } from "../viewer/camera";
import type { DarkMode } from "../viewer/appearance";
import { NavigationPersistence } from "../storage/navigation";
import { Viewer, type ViewerOptions } from "../viewer/viewer";
import {
  insideImage,
  layerNames,
  markerKinds,
  routeColor,
  type NavigationState,
  type Tool,
  type MapMarker,
  type PlannedRoute,
} from "../viewer/navigation";
import {
  lockDeviceOrientation,
  unlockDeviceOrientation,
} from "../viewer/orientation";
const timestamp = (value: number) =>
  new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const sheets = ["add", "layers", "saved", "more"] as const;
type Sheet = (typeof sheets)[number];
const savedTabs = ["routes", "places", "checkpoints"] as const;
type SavedTab = (typeof savedTabs)[number];
const SPOTLIGHT_MS = 4500;
const darkMessages: Record<DarkMode["kind"], string> = {
  inverted: "Light map: inverted, background pure black",
  deepened: "Dark map: background deepened to pure black",
  "already-dark": "Map is already dark",
};

// Owns map tools/dialogs and saves; the renderer only knows coordinates/appearance.
export class ViewerControls {
  private viewer?: Pick<
    Viewer,
    | "setTool"
    | "updateNavigation"
    | "zoomBy"
    | "panBy"
    | "rotateTo"
    | "jumpTo"
    | "fitPoints"
    | "centerPoint"
    | "fit"
  >;
  private controller = new AbortController();
  private persistence: NavigationPersistence;
  private tool: Tool = "browse";
  private activeRoute?: string;
  /** Points before editing began; undefined when the route is new. */
  private routeBefore?: Point[];
  private editingMarker?: string;
  private markerPoint?: Point;
  private autoMarkerName = "";
  private nameAction?: (name: string) => void;
  private unlockTimer?: ReturnType<typeof setTimeout>;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private spotlightTimer?: ReturnType<typeof setTimeout>;
  private confirmTimer?: ReturnType<typeof setTimeout>;
  private confirming?: string;
  private deviceLocked = false;
  private ownsFullscreen = false;
  private disposed = false;
  private openSheet?: Sheet;
  private darkKind: DarkMode["kind"] = "inverted";
  constructor(
    private root: HTMLElement,
    private map: MapRecord,
    private state: NavigationState,
    private verify: () => void,
  ) {
    this.persistence = new NavigationPersistence(
      () => this.state,
      () => {
        this.el("save-status").textContent =
          "Could not save. Keep this map open and free device storage.";
        this.toast("Could not save. Free some device storage.");
      },
    );
    this.bind();
    this.selectSaved("routes");
    this.sheet(undefined);
    this.render();
  }
  private el<T extends HTMLElement = HTMLElement>(id: string) {
    return this.root.querySelector<T>(`#${id}`)!;
  }
  private input(id: string) {
    return this.el<HTMLInputElement>(id);
  }
  private dialog(id: string) {
    return this.el<HTMLDialogElement>(id);
  }
  private on(
    target: EventTarget,
    type: string,
    action: (event: Event) => void,
  ) {
    target.addEventListener(type, action, { signal: this.controller.signal });
  }
  private click(id: string, action: () => void) {
    this.on(this.el(id), "click", action);
  }
  options(): ViewerOptions {
    return {
      navigation: this.state,
      overlay: this.root.querySelector<SVGSVGElement>("#map-overlay")!,
      onView: () => {
        this.persistence.changed();
        this.renderView();
      },
      onTap: (point) => this.onTap(point),
      onMarker: (marker) => this.editMarker(marker),
      onAppearance: (mode) => {
        this.darkKind = mode.kind;
        this.renderDark();
      },
    };
  }
  attach(viewer: NonNullable<ViewerControls["viewer"]>) {
    this.viewer = viewer;
    this.render();
  }
  private changed() {
    this.persistence.changed();
    this.viewer?.updateNavigation(this.state);
    this.render();
  }
  private toast(message: string) {
    const toast = this.el("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (toast.hidden = true), 2400);
  }
  private sheet(name: Sheet | undefined, returnFocus = false) {
    if (name && this.state.touchLocked) return;
    const previous = this.openSheet;
    this.openSheet = name;
    this.el("sheet").hidden = !name;
    this.el("sheet").style.transform = "";
    this.el("sheet-dismiss").hidden = !name;
    for (const sheet of sheets) {
      const panel = this.el(`sheet-${sheet}`);
      panel.hidden = sheet !== name;
      if (sheet === name)
        this.el("sheet-title").textContent = panel.dataset.title ?? "";
      this.el(`open-${sheet}`).setAttribute(
        "aria-expanded",
        String(sheet === name),
      );
    }
    this.root.querySelector<HTMLElement>(".sheet-content")!.scrollTop = 0;
    this.renderTool();
    if (name) this.el("close-sheet").focus();
    else if (returnFocus && previous) this.el(`open-${previous}`).focus();
  }
  private selectSaved(tab: SavedTab) {
    for (const name of savedTabs) {
      const selected = name === tab;
      const button = this.el(`saved-${name}`);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      this.el(`saved-list-${name}`).hidden = !selected;
    }
  }
  private mode(tool: Tool) {
    if (this.state.touchLocked) return;
    this.tool = tool;
    this.viewer?.setTool(tool, this.activeRoute);
    this.sheet(undefined);
    this.renderTool();
    this.el("map-canvas").focus();
  }
  private name(title: string, initial: string, action: (name: string) => void) {
    this.nameAction = action;
    this.el("name-title").textContent = title;
    this.input("name-input").value = initial;
    this.dialog("name-dialog").showModal();
    this.input("name-input").focus();
    this.input("name-input").select?.();
  }
  private markerKind() {
    for (const input of this.root.querySelectorAll<HTMLInputElement>(
      'input[name="marker-kind"]',
    ))
      if (input.checked) return input.value as MapMarker["kind"];
    return "landmark";
  }
  private setMarkerKind(kind: MapMarker["kind"]) {
    for (const input of this.root.querySelectorAll<HTMLInputElement>(
      'input[name="marker-kind"]',
    ))
      input.checked = input.value === kind;
  }
  private openMarker(
    title: string,
    point: Point,
    marker?: MapMarker,
  ) {
    this.editingMarker = marker?.id;
    this.markerPoint = point;
    const kind = marker?.kind ?? "landmark";
    this.autoMarkerName = marker
      ? ""
      : `${markerKinds[kind].label} ${this.state.markers.length + 1}`;
    this.el("marker-dialog-title").textContent = title;
    this.input("marker-label").value = marker?.label ?? this.autoMarkerName;
    this.setMarkerKind(kind);
    this.el<HTMLTextAreaElement>("marker-note").value = marker?.note ?? "";
    this.el("marker-delete").hidden = !marker;
    this.dialog("marker-dialog").showModal();
    if (!marker) {
      this.input("marker-label").focus();
      this.input("marker-label").select?.();
    }
  }
  private onTap(point: Point) {
    if (this.state.touchLocked || !insideImage(point, this.map)) return;
    if (this.tool === "marker") this.openMarker("New place", point);
    if (this.tool === "position") {
      this.state.position = { point, updated: Date.now() };
      this.changed();
      this.mode("browse");
      this.toast("Position estimate set");
    }
    if (this.tool === "checkpoint")
      this.name(
        "Confirm checkpoint",
        `Checkpoint ${this.state.checkpoints.length + 1}`,
        (label) => {
          this.state.checkpoints.push({
            id: crypto.randomUUID(),
            point,
            label,
            confirmed: Date.now(),
          });
          this.state.position = { point, updated: Date.now() };
          this.changed();
          this.mode("browse");
          this.toast("Checkpoint confirmed · position updated");
        },
      );
    if (this.tool === "route") {
      const route = this.route();
      if (route) {
        route.points.push(point);
        this.changed();
      }
    }
  }
  private route() {
    return this.state.routes.find((r) => r.id === this.activeRoute);
  }
  private editRoute(route: PlannedRoute) {
    this.routeBefore = route.draft ? undefined : [...route.points];
    route.draft = true;
    this.activeRoute = route.id;
    this.changed();
    this.mode("route");
  }
  // A route is only kept with at least two points; Done always leaves it finished.
  private finishRoute() {
    const route = this.route(),
      before = this.routeBefore;
    this.activeRoute = undefined;
    this.routeBefore = undefined;
    if (route) {
      if (route.points.length < 2 && before) {
        route.points = before;
        route.draft = false;
        this.toast(`${route.name} unchanged`);
      } else if (route.points.length >= 2) {
        route.draft = false;
        this.toast(`${route.name} saved · ${route.points.length} points`);
      } else {
        this.state.routes = this.state.routes.filter((r) => r.id !== route.id);
        if (route.points.length)
          this.toast("Route discarded: it needs at least 2 points");
      }
      this.changed();
    }
    this.mode("browse");
  }
  private editMarker(marker: MapMarker) {
    if (this.state.touchLocked) return;
    this.openMarker("Edit place", marker.point, marker);
  }
  private spotlight() {
    const stage = this.el("map-stage");
    const count =
      this.state.routes.length +
      this.state.markers.length +
      this.state.checkpoints.length +
      (this.state.position ? 1 : 0);
    this.sheet(undefined);
    if (!count) {
      this.toast("Nothing saved yet. Use Add to create routes and places.");
      return;
    }
    clearTimeout(this.spotlightTimer);
    // Restart the CSS animation when pressed again.
    stage.classList.remove("spotlight");
    void stage.offsetWidth;
    stage.classList.add("spotlight");
    this.spotlightTimer = setTimeout(
      () => stage.classList.remove("spotlight"),
      SPOTLIGHT_MS,
    );
  }
  private bind() {
    for (const sheet of sheets)
      this.click(`open-${sheet}`, () =>
        this.sheet(this.openSheet === sheet ? undefined : sheet, true),
      );
    this.click("close-sheet", () => this.sheet(undefined, true));
    this.click("sheet-dismiss", () => this.sheet(undefined, true));
    this.bindSheetDrag();
    this.on(this.root, "keydown", (event) => {
      if ((event as KeyboardEvent).key !== "Escape" || !this.escape()) return;
      event.preventDefault();
      event.stopPropagation();
    });
    for (const tab of savedTabs) {
      this.click(`saved-${tab}`, () => this.selectSaved(tab));
      this.on(this.el(`saved-${tab}`), "keydown", (event) => {
        const key = (event as KeyboardEvent).key;
        if (!["ArrowLeft", "ArrowRight"].includes(key)) return;
        event.preventDefault();
        const index = savedTabs.indexOf(tab);
        const next = savedTabs[(index + (key === "ArrowRight" ? 1 : 2)) % 3]!;
        this.selectSaved(next);
        this.el(`saved-${next}`).focus();
      });
    }
    this.click("zoom-in", () => this.viewer?.zoomBy(1.6));
    this.click("zoom-out", () => this.viewer?.zoomBy(1 / 1.6));
    this.click("fit", () => {
      this.viewer?.fit();
      this.sheet(undefined);
    });
    const dark = (value: boolean) => {
      if (this.state.touchLocked) return;
      this.state.inverted = value;
      this.changed();
    };
    this.click("quick-dark", () => {
      dark(!this.state.inverted);
      this.toast(
        this.state.inverted ? darkMessages[this.darkKind] : "Original colors",
      );
    });
    this.on(this.input("dark-map"), "change", () =>
      dark(this.input("dark-map").checked),
    );
    for (const layer of layerNames)
      this.on(this.input(`layer-${layer}`), "change", () => {
        this.state.layers[layer] = this.input(`layer-${layer}`).checked;
        this.changed();
      });
    this.click("spotlight", () => this.spotlight());
    this.on(this.input("rotation-lock"), "change", () => {
      this.state.rotationLocked = this.input("rotation-lock").checked;
      this.changed();
    });
    this.on(this.input("rotation-angle"), "input", () =>
      this.viewer?.rotateTo(
        (Number(this.input("rotation-angle").value) * Math.PI) / 180,
      ),
    );
    this.click("rotate-left", () =>
      this.viewer?.rotateTo((this.state.view?.rotation ?? 0) - Math.PI / 12),
    );
    this.click("rotate-right", () =>
      this.viewer?.rotateTo((this.state.view?.rotation ?? 0) + Math.PI / 12),
    );
    // Deliberate reset is allowed even while twisting is locked.
    this.click("rotate-north", () => this.viewer?.rotateTo(0, true));
    this.on(this.input("map-dimming"), "input", () => {
      this.state.dimming = Number(this.input("map-dimming").value) / 100;
      this.changed();
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-pan]",
    ))
      this.on(button, "click", () => {
        const directions: Record<string, [number, number]> = {
          up: [0, 100],
          down: [0, -100],
          left: [100, 0],
          right: [-100, 0],
        };
        const delta = directions[button.dataset.pan!];
        if (delta) this.viewer?.panBy(...delta);
      });
    this.click("device-orientation", () => {
      void this.deviceOrientation();
    });
    this.on(document, "fullscreenchange", () => {
      if (
        !document.fullscreenElement &&
        !window.matchMedia("(display-mode: standalone)").matches
      ) {
        this.deviceLocked = false;
        this.el("device-orientation").textContent = "Lock screen orientation";
      }
    });
    this.click("touch-lock", () => {
      if (this.tool === "route") this.finishRoute();
      this.mode("browse");
      this.state.touchLocked = true;
      this.sheet(undefined);
      this.changed();
    });
    this.bindUnlock();
    this.on(document, "visibilitychange", () => {
      if (document.hidden) void this.flush();
    });
    this.on(window, "pagehide", () => {
      void this.flush();
    });
    this.click("add-marker", () => this.mode("marker"));
    this.click("set-position", () => this.mode("position"));
    this.click("add-checkpoint", () => this.mode("checkpoint"));
    // Start drawing immediately; the default name can be changed from Saved.
    this.click("add-route", () => {
      const route: PlannedRoute = {
        id: crypto.randomUUID(),
        name: `Route ${this.state.routes.length + 1}`,
        points: [],
        created: Date.now(),
        draft: true,
      };
      this.state.routes.push(route);
      this.editRoute(route);
    });
    this.click("tool-done", () => {
      if (this.tool === "route") this.finishRoute();
      else this.mode("browse");
    });
    this.click("tool-center", () => {
      const point = this.viewer?.centerPoint();
      if (point) this.onTap(point);
    });
    this.click("route-undo", () => {
      const route = this.route();
      if (route?.points.length) {
        route.points.pop();
        this.changed();
      }
    });
    this.click("marker-cancel", () => this.dialog("marker-dialog").close());
    this.click("marker-delete", () => {
      this.state.markers = this.state.markers.filter(
        (m) => m.id !== this.editingMarker,
      );
      this.dialog("marker-dialog").close();
      this.changed();
      this.mode("browse");
      this.toast("Place deleted");
    });
    for (const input of this.root.querySelectorAll<HTMLInputElement>(
      'input[name="marker-kind"]',
    ))
      this.on(input, "change", () => {
        // Keep auto names in sync with the chosen kind until the user types.
        const label = this.input("marker-label");
        if (this.autoMarkerName && label.value === this.autoMarkerName) {
          this.autoMarkerName = `${markerKinds[this.markerKind()].label} ${this.state.markers.length + 1}`;
          label.value = this.autoMarkerName;
        }
      });
    this.on(this.el("marker-form"), "submit", (event) => {
      event.preventDefault();
      if (!this.markerPoint) return;
      const label = this.input("marker-label").value.trim();
      if (!label) return;
      const existing = this.state.markers.find(
        (m) => m.id === this.editingMarker,
      );
      const marker: MapMarker = {
        id: existing?.id ?? crypto.randomUUID(),
        point: this.markerPoint,
        label,
        note: this.el<HTMLTextAreaElement>("marker-note").value.trim(),
        kind: this.markerKind(),
        created: existing?.created ?? Date.now(),
      };
      this.state.markers = this.state.markers.filter((m) => m.id !== marker.id);
      this.state.markers.push(marker);
      this.dialog("marker-dialog").close();
      this.changed();
      this.mode("browse");
      this.toast(existing ? "Place updated" : `${label} saved`);
    });
    this.click("name-cancel", () => this.dialog("name-dialog").close());
    this.on(this.el("name-form"), "submit", (event) => {
      event.preventDefault();
      const name = this.input("name-input").value.trim();
      if (!name) return;
      this.dialog("name-dialog").close();
      this.nameAction?.(name);
      this.nameAction = undefined;
    });
    this.click("verify-current-map", () => this.verify());
  }
  // Swipe the sheet header down to dismiss it, like native bottom sheets.
  private bindSheetDrag() {
    const sheet = this.el("sheet");
    let start: number | undefined, offset = 0;
    for (const handle of [this.el("sheet-grabber"), this.el("sheet-title")]) {
      this.on(handle, "pointerdown", (event) => {
        const pointer = event as PointerEvent;
        start = pointer.clientY;
        offset = 0;
        handle.setPointerCapture?.(pointer.pointerId);
        sheet.classList.add("dragging");
      });
      this.on(handle, "pointermove", (event) => {
        if (start === undefined) return;
        offset = Math.max(0, (event as PointerEvent).clientY - start);
        sheet.style.transform = `translateY(${offset}px)`;
      });
      for (const type of ["pointerup", "pointercancel"])
        this.on(handle, type, () => {
          if (start === undefined) return;
          start = undefined;
          sheet.classList.remove("dragging");
          if (offset > 70) this.sheet(undefined, true);
          else sheet.style.transform = "";
        });
    }
  }
  private bindUnlock() {
    const unlock = this.el<HTMLButtonElement>("unlock-view");
    const cancelUnlock = () => {
      clearTimeout(this.unlockTimer);
      this.unlockTimer = undefined;
      unlock.classList.remove("holding");
    };
    const startUnlock = () => {
      if (this.unlockTimer) return;
      unlock.classList.add("holding");
      this.unlockTimer = setTimeout(() => {
        cancelUnlock();
        this.state.touchLocked = false;
        this.changed();
        this.toast("Touches unlocked");
      }, 1000);
    };
    this.on(unlock, "pointerdown", (event) => {
      const pointer = event as PointerEvent;
      if (pointer.button !== 0) return;
      unlock.setPointerCapture(pointer.pointerId);
      startUnlock();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      this.on(unlock, type, cancelUnlock);
    this.on(unlock, "keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        startUnlock();
      }
    });
    this.on(unlock, "keyup", cancelUnlock);
    this.on(unlock, "blur", cancelUnlock);
    this.on(document, "visibilitychange", () => {
      if (document.hidden) cancelUnlock();
    });
  }
  private async deviceOrientation() {
    if (this.deviceLocked) {
      if (!unlockDeviceOrientation()) {
        this.el("orientation-message").textContent =
          "Screen orientation could not be unlocked. Use your phone’s rotation controls.";
        return;
      }
      this.deviceLocked = false;
      this.el("device-orientation").textContent = "Lock screen orientation";
      this.el("orientation-message").textContent =
        "Screen orientation unlocked.";
      return;
    }
    const button = this.el<HTMLButtonElement>("device-orientation");
    button.disabled = true;
    try {
      const result = await lockDeviceOrientation(document.documentElement);
      if (this.disposed) {
        if (result.locked) unlockDeviceOrientation();
        if (result.enteredFullscreen)
          await document.exitFullscreen().catch(() => {});
        return;
      }
      this.deviceLocked = result.locked;
      this.ownsFullscreen ||= result.enteredFullscreen;
      button.textContent = result.locked
        ? "Unlock screen orientation"
        : "Lock screen orientation";
      this.el("orientation-message").textContent = result.message;
    } finally {
      button.disabled = false;
    }
  }
  private renderView() {
    const rotation =
      ((Math.round(((this.state.view?.rotation ?? 0) * 180) / Math.PI) % 360) +
        360) %
      360;
    this.input("rotation-angle").value = String(rotation);
    this.el("rotation-value").textContent = `${rotation}°`;
    this.el<HTMLButtonElement>("rotate-north").disabled =
      rotation === 0 || this.state.touchLocked;
  }
  private renderDark() {
    this.el("dark-status").textContent = this.state.inverted
      ? darkMessages[this.darkKind]
      : "Off: original colors";
  }
  /** Backs out one level (sheet → tool → browse); false when already browsing. */
  escape() {
    if (this.root.querySelector("dialog[open]")) return false;
    if (this.openSheet) this.sheet(undefined, true);
    else if (this.tool === "route") this.finishRoute();
    else if (this.tool !== "browse") this.mode("browse");
    else return false;
    return true;
  }
  private renderTool() {
    this.root.dataset.tool = this.tool;
    const editing = this.tool !== "browse",
      locked = this.state.touchLocked,
      sheetOpen = !!this.openSheet;
    this.el("dock").hidden = locked || editing || sheetOpen;
    this.el("zoom-rail").hidden = locked || sheetOpen;
    this.el("tool-bar").hidden = !editing || locked || sheetOpen;
    this.el("placement-center").hidden = !editing || locked || sheetOpen;
    this.el("touch-lock").hidden = locked;
    const route = this.route();
    const count = route?.points.length ?? 0;
    const texts: Record<Tool, [string, string, string]> = {
      browse: ["", "", ""],
      marker: ["New place", "Tap the map, or aim the crosshair.", "Place here"],
      position: [
        "Your position",
        "Tap where you think you are. Manual estimate.",
        "I’m here",
      ],
      checkpoint: [
        "Checkpoint",
        "Tap a spot you recognize right now.",
        "Confirm here",
      ],
      route: [
        `${route?.name ?? "Route"} · ${count} point${count === 1 ? "" : "s"}`,
        count
          ? "Keep tapping along passages."
          : "Tap the map where the route starts.",
        "Add point",
      ],
    };
    const [title, message, action] = texts[this.tool];
    this.el("tool-title").textContent = title;
    this.el("tool-message").textContent = message;
    this.el("tool-center-label").textContent = action;
    this.el("route-undo").hidden = this.tool !== "route";
    this.el<HTMLButtonElement>("route-undo").disabled = !count;
    this.el("tool-done").textContent =
      this.tool === "route" ? (count >= 2 ? "Done" : "Cancel") : "Cancel";
    this.el("tool-done").classList.toggle(
      "ready",
      this.tool === "route" && count >= 2,
    );
  }
  private row(
    container: HTMLElement,
    options: {
      label: string;
      detail: string;
      color: string;
      jump: () => void;
      actions?: { label: string; action: () => void; danger?: boolean }[];
    },
  ) {
    const row = document.createElement("div");
    row.className = "navigation-row";
    const button = document.createElement("button");
    button.className = "navigation-jump";
    const swatch = document.createElement("i"),
      text = document.createElement("span"),
      title = document.createElement("strong"),
      description = document.createElement("small");
    swatch.className = "row-swatch";
    swatch.style.background = options.color;
    title.textContent = options.label;
    description.textContent = options.detail;
    text.append(title, description);
    button.append(swatch, text);
    button.disabled = this.state.touchLocked;
    button.addEventListener("click", () => {
      options.jump();
      this.sheet(undefined);
    });
    row.append(button);
    if (options.actions?.length) {
      const actions = document.createElement("div");
      actions.className = "row-actions";
      for (const extra of options.actions) {
        const action = document.createElement("button");
        action.className = extra.danger ? "chip-button danger-text" : "chip-button";
        action.textContent = extra.label;
        action.disabled = this.state.touchLocked;
        action.addEventListener("click", extra.action);
        actions.append(action);
      }
      row.append(actions);
    }
    container.append(row);
  }
  // Two taps to delete: the first arms the button for a few seconds.
  private confirmDelete(key: string, action: () => void) {
    return () => {
      if (this.confirming === key) {
        clearTimeout(this.confirmTimer);
        this.confirming = undefined;
        action();
        return;
      }
      this.confirming = key;
      clearTimeout(this.confirmTimer);
      this.confirmTimer = setTimeout(() => {
        this.confirming = undefined;
        this.render();
      }, 3000);
      this.render();
    };
  }
  private deleteLabel(key: string) {
    return this.confirming === key ? "Tap again to delete" : "Delete";
  }
  private render() {
    const locked = this.state.touchLocked;
    this.input("rotation-lock").checked = this.state.rotationLocked;
    this.input("dark-map").checked = this.state.inverted;
    this.input("map-dimming").value = String(this.state.dimming * 100);
    this.el("dimming-value").textContent =
      `${Math.round(this.state.dimming * 100)}%`;
    this.el("quick-dark").setAttribute("aria-pressed", String(this.state.inverted));
    this.el("touch-lock").setAttribute("aria-pressed", String(locked));
    this.el("touch-locked").hidden = !locked;
    this.renderDark();
    const counts = {
      routes: this.state.routes.length,
      places: this.state.markers.length,
      checkpoints: this.state.checkpoints.length,
      position: this.state.position ? 1 : 0,
    };
    for (const layer of layerNames) {
      this.input(`layer-${layer}`).checked = this.state.layers[layer];
      if (layer !== "labels")
        this.el(`layer-${layer}-count`).textContent = String(counts[layer]);
    }
    for (const tab of savedTabs)
      this.el(`saved-${tab}-count`).textContent = String(counts[tab]);
    for (const id of [
      "quick-dark",
      "dark-map",
      "rotation-lock",
      "map-dimming",
      "add-marker",
      "set-position",
      "add-checkpoint",
      "add-route",
      "zoom-in",
      "zoom-out",
      "fit",
      "spotlight",
      "device-orientation",
      ...sheets.map((sheet) => `open-${sheet}`),
    ])
      this.el<HTMLButtonElement | HTMLInputElement>(id).disabled = locked;
    for (const id of ["rotation-angle", "rotate-left", "rotate-right"])
      this.el<HTMLInputElement | HTMLButtonElement>(id).disabled =
        this.state.rotationLocked || locked;
    this.el("map-offline-status").textContent = this.map.offlineVerifiedAt
      ? `Last checked ${timestamp(this.map.offlineVerifiedAt)}. Recheck before a trip.`
      : "Not checked yet. Check before going underground.";
    const markers = this.el("marker-list"),
      checkpoints = this.el("checkpoint-list"),
      routes = this.el("route-list"),
      position = this.el("position-row");
    markers.replaceChildren();
    checkpoints.replaceChildren();
    routes.replaceChildren();
    position.replaceChildren();
    if (this.state.position) {
      const estimate = this.state.position;
      this.row(position, {
        label: "My position (estimate)",
        detail: `Set ${timestamp(estimate.updated)}`,
        color: "#c18bff",
        jump: () => this.viewer?.jumpTo(estimate.point),
        actions: [
          { label: "Move", action: () => this.mode("position") },
          {
            label: "Clear",
            action: () => {
              delete this.state.position;
              this.changed();
            },
          },
        ],
      });
    }
    for (const marker of this.state.markers) {
      const kind = markerKinds[marker.kind] ?? markerKinds.bookmark;
      this.row(markers, {
        label: marker.label,
        detail: `${kind.label}${marker.note ? " · " + marker.note : ""}`,
        color: kind.color,
        jump: () => this.viewer?.jumpTo(marker.point),
        actions: [{ label: "Edit", action: () => this.editMarker(marker) }],
      });
    }
    for (const checkpoint of this.state.checkpoints)
      this.row(checkpoints, {
        label: checkpoint.label,
        detail: `Confirmed ${timestamp(checkpoint.confirmed)}`,
        color: "#ffb15c",
        jump: () => this.viewer?.jumpTo(checkpoint.point),
        actions: [
          {
            label: this.deleteLabel(checkpoint.id),
            danger: true,
            action: this.confirmDelete(checkpoint.id, () => {
              this.state.checkpoints = this.state.checkpoints.filter(
                (c) => c.id !== checkpoint.id,
              );
              this.changed();
            }),
          },
        ],
      });
    for (const route of this.state.routes)
      this.row(routes, {
        label: route.name,
        detail: `${route.points.length} points${route.draft ? " · unfinished" : ""}`,
        color: routeColor(this.state, route.id),
        jump: () => this.viewer?.fitPoints(route.points),
        actions: [
          {
            label: route.draft ? "Continue" : "Edit points",
            action: () => this.editRoute(route),
          },
          {
            label: "Rename",
            action: () =>
              this.name("Rename route", route.name, (name) => {
                route.name = name;
                this.changed();
              }),
          },
          {
            label: this.deleteLabel(route.id),
            danger: true,
            action: this.confirmDelete(route.id, () => {
              this.state.routes = this.state.routes.filter(
                (r) => r.id !== route.id,
              );
              if (this.activeRoute === route.id) {
                this.activeRoute = undefined;
                this.mode("browse");
              }
              this.changed();
            }),
          },
        ],
      });
    for (const [container, empty] of [
      [markers, this.state.position ? "" : "No places yet. Use Add › Place."],
      [checkpoints, "No checkpoints yet."],
      [routes, "No routes yet. Use Add › Route, then tap along passages."],
    ] as const)
      if (!container.childElementCount && empty) {
        const p = document.createElement("p");
        p.className = "empty-list";
        p.textContent = empty;
        container.append(p);
      }
    this.renderView();
    this.renderTool();
  }
  refreshMetadata() {
    this.render();
  }
  async flush() {
    await this.persistence.flush();
  }
  dispose() {
    this.disposed = true;
    // Leaving mid-route keeps a usable route rather than an orphan draft.
    if (this.tool === "route") this.finishRoute();
    this.sheet(undefined);
    clearTimeout(this.unlockTimer);
    clearTimeout(this.toastTimer);
    clearTimeout(this.spotlightTimer);
    clearTimeout(this.confirmTimer);
    this.el("map-stage").classList.remove("spotlight");
    this.el("toast").hidden = true;
    const saved = this.flush();
    this.controller.abort();
    this.dialog("marker-dialog").close();
    this.dialog("name-dialog").close();
    if (this.deviceLocked) unlockDeviceOrientation();
    if (
      this.ownsFullscreen &&
      document.fullscreenElement === document.documentElement
    )
      void document.exitFullscreen().catch(() => {});
    return saved;
  }
}
