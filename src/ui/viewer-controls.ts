import type { MapRecord } from "../types";
import type { Point } from "../viewer/camera";
import { NavigationPersistence } from "../storage/navigation";
import { Viewer, type ViewerOptions } from "../viewer/viewer";
import {
  insideImage,
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
const toolTabs = ["display", "places", "routes"] as const;

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
    | "centerPoint"
    | "fit"
  >;
  private controller = new AbortController();
  private persistence: NavigationPersistence;
  private tool: Tool = "browse";
  private activeRoute?: string;
  private editingMarker?: string;
  private markerPoint?: Point;
  private nameAction?: (name: string) => void;
  private unlockTimer?: ReturnType<typeof setTimeout>;
  private deviceLocked = false;
  private ownsFullscreen = false;
  private disposed = false;
  private toolTab: (typeof toolTabs)[number] = "display";
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
      },
    );
    this.bind();
    this.selectTab("display");
    this.panel(false);
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
  private click(id: string, action: () => void) {
    this.el(id).addEventListener("click", action, {
      signal: this.controller.signal,
    });
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
  private panel(open: boolean, returnFocus = false) {
    if (open && this.state.touchLocked) return;
    this.el("map-panel").hidden = !open;
    this.el("sheet-dismiss").hidden = !open;
    this.el("toggle-panel").setAttribute("aria-expanded", String(open));
    this.el("toggle-panel").setAttribute(
      "aria-label",
      open ? "Close map tools" : "Open map tools",
    );
    this.renderTool();
    if (open) this.el(`tools-${this.toolTab}`).focus();
    else if (returnFocus) this.el("toggle-panel").focus();
  }
  // Native buttons with roving tab focus keep the tools sheet usable by keyboard.
  private selectTab(tab: (typeof toolTabs)[number]) {
    this.toolTab = tab;
    for (const name of toolTabs) {
      const selected = name === tab;
      const button = this.el<HTMLButtonElement>(`tools-${name}`);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      this.el(`tab-${name}`).hidden = !selected;
    }
    this.root.querySelector<HTMLElement>(".sheet-content")!.scrollTop = 0;
  }
  private mode(tool: Tool) {
    if (this.state.touchLocked) return;
    this.tool = tool;
    this.viewer?.setTool(tool);
    this.panel(false);
    this.renderTool();
    this.el("map-canvas").focus();
  }
  private name(title: string, initial: string, action: (name: string) => void) {
    this.nameAction = action;
    this.el("name-title").textContent = title;
    this.input("name-input").value = initial;
    this.dialog("name-dialog").showModal();
    this.input("name-input").focus();
  }
  private onTap(point: Point) {
    if (this.state.touchLocked || !insideImage(point, this.map)) return;
    if (this.tool === "marker") {
      this.editingMarker = undefined;
      this.markerPoint = point;
      this.el("marker-dialog-title").textContent = "Add bookmark";
      this.input("marker-label").value = "";
      this.el<HTMLSelectElement>("marker-kind").value = "bookmark";
      this.el<HTMLTextAreaElement>("marker-note").value = "";
      this.el("marker-delete").hidden = true;
      this.dialog("marker-dialog").showModal();
      this.input("marker-label").focus();
    }
    if (this.tool === "position") {
      this.state.position = { point, updated: Date.now() };
      this.changed();
      this.mode("browse");
    }
    if (this.tool === "checkpoint")
      this.name(
        "Confirm recognized checkpoint",
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
        },
      );
    if (this.tool === "route") {
      const route = this.state.routes.find((r) => r.id === this.activeRoute);
      if (route) {
        route.points.push(point);
        this.changed();
      }
    }
  }
  private editMarker(marker: MapMarker) {
    if (this.state.touchLocked) return;
    this.editingMarker = marker.id;
    this.markerPoint = marker.point;
    this.el("marker-dialog-title").textContent = "Edit bookmark";
    this.input("marker-label").value = marker.label;
    this.el<HTMLSelectElement>("marker-kind").value = marker.kind;
    this.el<HTMLTextAreaElement>("marker-note").value = marker.note;
    this.el("marker-delete").hidden = false;
    this.dialog("marker-dialog").showModal();
  }
  private bind() {
    const signal = this.controller.signal;
    this.click("toggle-panel", () => this.panel(this.el("map-panel").hidden));
    this.click("close-panel", () => this.panel(false, true));
    this.click("sheet-dismiss", () => this.panel(false, true));
    this.root.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Escape" &&
          !this.el("map-panel").hidden &&
          !this.root.querySelector("dialog[open]")
        ) {
          event.preventDefault();
          event.stopPropagation();
          this.panel(false, true);
        }
      },
      { signal },
    );
    for (const tab of toolTabs) {
      const button = this.el(`tools-${tab}`);
      this.click(`tools-${tab}`, () => this.selectTab(tab));
      button.addEventListener(
        "keydown",
        (event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const index = toolTabs.indexOf(tab);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? 2
                : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
          this.selectTab(toolTabs[next]!);
          this.el(`tools-${this.toolTab}`).focus();
        },
        { signal },
      );
    }
    this.click("zoom-in", () => this.viewer?.zoomBy(1.5));
    this.click("zoom-out", () => this.viewer?.zoomBy(1 / 1.5));
    this.click("fit", () => this.viewer?.fit());
    const invert = () => {
      if (this.state.touchLocked) return;
      this.state.inverted = !this.state.inverted;
      this.changed();
    };
    this.click("quick-invert", invert);
    this.input("invert-colors").addEventListener("change", invert, { signal });
    this.input("rotation-lock").addEventListener(
      "change",
      () => {
        this.state.rotationLocked = this.input("rotation-lock").checked;
        this.changed();
      },
      { signal },
    );
    this.input("rotation-angle").addEventListener(
      "input",
      () =>
        this.viewer?.rotateTo(
          (Number(this.input("rotation-angle").value) * Math.PI) / 180,
        ),
      { signal },
    );
    this.click("rotate-left", () =>
      this.viewer?.rotateTo((this.state.view?.rotation ?? 0) - Math.PI / 12),
    );
    this.click("rotate-right", () =>
      this.viewer?.rotateTo((this.state.view?.rotation ?? 0) + Math.PI / 12),
    );
    this.input("map-dimming").addEventListener(
      "input",
      () => {
        this.state.dimming = Number(this.input("map-dimming").value) / 100;
        this.changed();
      },
      { signal },
    );
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-pan]",
    ))
      button.addEventListener(
        "click",
        () => {
          const directions: Record<string, [number, number]> = {
            up: [0, 100],
            down: [0, -100],
            left: [100, 0],
            right: [-100, 0],
          };
          const delta = directions[button.dataset.pan!];
          if (delta) this.viewer?.panBy(...delta);
        },
        { signal },
      );
    this.click("device-orientation", () => {
      void this.deviceOrientation();
    });
    document.addEventListener(
      "fullscreenchange",
      () => {
        if (
          !document.fullscreenElement &&
          !window.matchMedia("(display-mode: standalone)").matches
        ) {
          this.deviceLocked = false;
          this.el("device-orientation").textContent = "Lock device orientation";
        }
      },
      { signal },
    );
    this.click("touch-lock", () => {
      this.state.touchLocked = true;
      this.mode("browse");
      this.tool = "browse";
      this.viewer?.setTool("browse");
      this.panel(false);
      this.changed();
    });
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
      }, 1000);
    };
    unlock.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        unlock.setPointerCapture(event.pointerId);
        startUnlock();
      },
      { signal },
    );
    for (const event of [
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ] as const)
      unlock.addEventListener(event, cancelUnlock, { signal });
    unlock.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          startUnlock();
        }
      },
      { signal },
    );
    unlock.addEventListener("keyup", cancelUnlock, { signal });
    unlock.addEventListener("blur", cancelUnlock, { signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          cancelUnlock();
          void this.flush();
        }
      },
      { signal },
    );
    window.addEventListener(
      "pagehide",
      () => {
        void this.flush();
      },
      { signal },
    );
    this.click("add-marker", () => this.mode("marker"));
    this.click("set-position", () => this.mode("position"));
    this.click("add-checkpoint", () => this.mode("checkpoint"));
    this.click("jump-position", () => {
      if (this.state.position) {
        this.viewer?.jumpTo(this.state.position.point);
        this.panel(false);
      }
    });
    this.click("clear-position", () => {
      delete this.state.position;
      this.changed();
    });
    this.click("add-route", () =>
      this.name(
        "Name planned route",
        `Route ${this.state.routes.length + 1}`,
        (name) => {
          const route: PlannedRoute = {
            id: crypto.randomUUID(),
            name,
            points: [],
            created: Date.now(),
            draft: true,
          };
          this.state.routes.push(route);
          this.activeRoute = route.id;
          this.changed();
          this.mode("route");
        },
      ),
    );
    this.click("tool-cancel", () => this.mode("browse"));
    this.click("tool-center", () => {
      const point = this.viewer?.centerPoint();
      if (point) this.onTap(point);
    });
    this.click("route-undo", () => {
      this.state.routes.find((r) => r.id === this.activeRoute)?.points.pop();
      this.changed();
    });
    this.click("route-finish", () => {
      const route = this.state.routes.find((r) => r.id === this.activeRoute);
      if (route && route.points.length >= 2) {
        route.draft = false;
        this.changed();
        this.mode("browse");
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
    });
    this.el<HTMLFormElement>("marker-form").addEventListener(
      "submit",
      (event) => {
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
          kind: this.el<HTMLSelectElement>("marker-kind")
            .value as MapMarker["kind"],
          created: existing?.created ?? Date.now(),
        };
        this.state.markers = this.state.markers.filter(
          (m) => m.id !== marker.id,
        );
        this.state.markers.push(marker);
        this.dialog("marker-dialog").close();
        this.changed();
        this.mode("browse");
      },
      { signal },
    );
    this.click("name-cancel", () => this.dialog("name-dialog").close());
    this.el<HTMLFormElement>("name-form").addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        const name = this.input("name-input").value.trim();
        if (!name) return;
        this.dialog("name-dialog").close();
        this.nameAction?.(name);
        this.nameAction = undefined;
      },
      { signal },
    );
    this.click("verify-current-map", () => this.verify());
  }
  private async deviceOrientation() {
    if (this.deviceLocked) {
      if (!unlockDeviceOrientation()) {
        this.el("orientation-message").textContent =
          "Device orientation could not be unlocked. Use your phone’s system rotation controls.";
        return;
      }
      this.deviceLocked = false;
      this.el("device-orientation").textContent = "Lock device orientation";
      this.el("orientation-message").textContent =
        "Device orientation unlocked.";
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
        ? "Unlock device orientation"
        : "Lock device orientation";
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
  }
  private renderTool() {
    const editing = this.tool !== "browse";
    const sheetOpen = !this.el("map-panel").hidden;
    this.root.querySelector<HTMLElement>(".viewer-controls")!.hidden =
      this.state.touchLocked || editing || sheetOpen;
    this.el("tool-hint").hidden =
      !editing || this.state.touchLocked || sheetOpen;
    this.el("placement-center").hidden =
      !editing || this.state.touchLocked || sheetOpen;
    const messages: Record<Tool, string> = {
      browse: "",
      marker: "Tap a place to add a bookmark or note.",
      position: "Tap your estimated position. This is a manual estimate.",
      checkpoint: "Tap a junction you recognize to confirm a checkpoint.",
      route: "Tap along passages to add route points. Drag/pinch to navigate.",
    };
    this.el("tool-message").textContent = messages[this.tool];
    this.el("route-undo").hidden = this.tool !== "route";
    this.el("route-finish").hidden = this.tool !== "route";
    const route = this.state.routes.find((r) => r.id === this.activeRoute);
    this.el<HTMLButtonElement>("route-undo").disabled = !route?.points.length;
    this.el<HTMLButtonElement>("route-finish").disabled =
      (route?.points.length ?? 0) < 2;
  }
  private row(
    container: HTMLElement,
    label: string,
    detail: string,
    jump: () => void,
    extras: { label: string; action: () => void }[] = [],
  ) {
    const row = document.createElement("div");
    row.className = "navigation-row";
    const button = document.createElement("button");
    button.className = "navigation-jump";
    const title = document.createElement("strong"),
      description = document.createElement("small");
    title.textContent = label;
    description.textContent = detail;
    button.append(title, description);
    button.disabled = this.state.touchLocked;
    button.addEventListener("click", () => {
      jump();
      this.panel(false);
    });
    row.append(button);
    for (const extra of extras) {
      const action = document.createElement("button");
      action.className = "text-button";
      action.textContent = extra.label;
      action.disabled = this.state.touchLocked;
      action.addEventListener("click", extra.action);
      row.append(action);
    }
    container.append(row);
  }
  private render() {
    this.input("rotation-lock").checked = this.state.rotationLocked;
    this.input("invert-colors").checked = this.state.inverted;
    this.input("map-dimming").value = String(this.state.dimming * 100);
    this.el("dimming-value").textContent =
      `${Math.round(this.state.dimming * 100)}%`;
    this.el("quick-invert").setAttribute(
      "aria-pressed",
      String(this.state.inverted),
    );
    this.el("touch-lock").setAttribute(
      "aria-pressed",
      String(this.state.touchLocked),
    );
    this.el("touch-locked").hidden = !this.state.touchLocked;
    for (const id of [
      "quick-invert",
      "toggle-panel",
      "invert-colors",
      "rotation-lock",
      "map-dimming",
      "add-marker",
      "set-position",
      "clear-position",
      "add-checkpoint",
      "add-route",
      "zoom-in",
      "zoom-out",
      "fit",
      "device-orientation",
    ])
      this.el<HTMLButtonElement | HTMLInputElement>(id).disabled =
        this.state.touchLocked;
    for (const id of ["rotation-angle", "rotate-left", "rotate-right"])
      this.el<HTMLInputElement | HTMLButtonElement>(id).disabled =
        this.state.rotationLocked || this.state.touchLocked;
    this.el<HTMLButtonElement>("jump-position").disabled =
      !this.state.position || this.state.touchLocked;
    this.el("position-status").textContent = this.state.position
      ? `Estimated manually · ${timestamp(this.state.position.updated)}`
      : "No estimated position set.";
    this.el("map-offline-status").textContent = this.map.offlineVerifiedAt
      ? `Last checked ${timestamp(this.map.offlineVerifiedAt)}. Recheck before a trip.`
      : "Not checked yet.";
    const markers = this.el("marker-list"),
      checkpoints = this.el("checkpoint-list"),
      routes = this.el("route-list");
    markers.replaceChildren();
    checkpoints.replaceChildren();
    routes.replaceChildren();
    for (const marker of this.state.markers)
      this.row(
        markers,
        marker.label,
        `${marker.kind}${marker.note ? " · " + marker.note : ""}`,
        () => this.viewer?.jumpTo(marker.point),
        [{ label: "Edit", action: () => this.editMarker(marker) }],
      );
    for (const checkpoint of this.state.checkpoints)
      this.row(
        checkpoints,
        checkpoint.label,
        timestamp(checkpoint.confirmed),
        () => this.viewer?.jumpTo(checkpoint.point),
        [
          {
            label: "Remove",
            action: () => {
              this.state.checkpoints = this.state.checkpoints.filter(
                (c) => c.id !== checkpoint.id,
              );
              this.changed();
            },
          },
        ],
      );
    for (const route of this.state.routes)
      this.row(
        routes,
        route.name,
        `${route.points.length} points${route.draft ? " · unfinished" : ""}`,
        () => {
          if (route.points[0]) this.viewer?.jumpTo(route.points[0]);
        },
        [
          {
            label: route.draft ? "Continue" : "Extend",
            action: () => {
              route.draft = true;
              this.activeRoute = route.id;
              this.changed();
              this.mode("route");
            },
          },
          {
            label: "Delete",
            action: () => {
              this.state.routes = this.state.routes.filter(
                (r) => r.id !== route.id,
              );
              if (this.activeRoute === route.id) this.mode("browse");
              this.changed();
            },
          },
        ],
      );
    for (const [container, empty] of [
      [markers, "No bookmarks yet."],
      [checkpoints, "No confirmed checkpoints yet."],
      [routes, "No planned routes yet."],
    ] as const)
      if (!container.childElementCount) {
        const p = document.createElement("p");
        p.className = "field-help";
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
    this.panel(false);
    clearTimeout(this.unlockTimer);
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
