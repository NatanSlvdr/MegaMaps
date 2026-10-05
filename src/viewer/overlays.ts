import { worldToScreen, type Camera, type Point, type Size } from "./camera";
import {
  markerKinds,
  routeColor,
  type Layers,
  type MapMarker,
  type NavigationState,
} from "./navigation";
const NS = "http://www.w3.org/2000/svg";
const node = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
) => {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, value);
  return element;
};
// Small glyphs drawn inside 22px pins, in pin-local coordinates.
const glyphs: Record<MapMarker["kind"], { d: string; fill?: boolean }> = {
  landmark: {
    d: "M0,-6.5L1.9,-2.1 6.5,-2.1 2.8,0.9 4,5.6 0,2.9 -4,5.6 -2.8,0.9 -6.5,-2.1 -1.9,-2.1Z",
    fill: true,
  },
  entrance: { d: "M-5,5V0A5,5 0 0 1 5,0V5" },
  junction: { d: "M0,6V0M0,0L-5,-5M0,0L5,-5" },
  bookmark: { d: "M-3,6V-6H5L3,-3L5,0H-3" },
  note: { d: "M-4,-3H4M-4,0H4M-4,3H1" },
};
const CASING = "#05070a";
type Layer = keyof Layers;
interface PathItem {
  element: SVGPathElement;
  points: Point[];
  dots?: boolean;
}
// Screen-space SVG keeps lines/labels legible without another raster surface.
// Text is assigned through textContent; imported/user names never become markup.
// Visibility is CSS-driven (svg classes) so toggling layers needs no rebuild.
export class NavigationOverlay {
  private points: { element: SVGGElement; point: Point }[] = [];
  private paths: PathItem[] = [];
  private preview?: { element: SVGPathElement; from: Point };
  private editing?: string;
  private state?: NavigationState;
  constructor(private svg: SVGSVGElement) {}
  setEditing(routeId?: string) {
    this.editing = routeId;
    if (this.state) this.rebuild(this.state);
  }
  setLayers(layers: Layers) {
    for (const [name, visible] of Object.entries(layers))
      this.svg.classList.toggle(`hide-${name}`, !visible);
  }
  rebuild(state: NavigationState) {
    this.state = state;
    this.svg.replaceChildren();
    this.points = [];
    this.paths = [];
    this.preview = undefined;
    this.setLayers(state.layers);
    const group = (layer: Layer, className = "") => {
      const element = node("g", { "data-layer": layer, class: className });
      this.svg.append(element);
      return element;
    };
    const path = (
      parent: SVGGElement,
      points: Point[],
      attributes: Record<string, string>,
      dots = false,
    ) => {
      const element = node("path", {
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        ...attributes,
      });
      parent.append(element);
      this.paths.push({ element, points, dots });
      return element;
    };
    const label = (parent: SVGGElement, text: string, x = 15, y = -13) => {
      const element = node("text", {
        x: String(x),
        y: String(y),
        class: "overlay-label",
      });
      element.textContent = text;
      parent.append(element);
    };
    const pin = (parent: SVGGElement, point: Point) => {
      const element = node("g");
      const body = node("g", { class: "pin-body" });
      element.append(body);
      parent.append(element);
      this.points.push({ element, point });
      return { element, body };
    };
    // Lines first so every pin and label sits above them.
    const routes = group("routes");
    for (const route of state.routes) {
      const color = routeColor(state, route.id),
        active = route.id === this.editing;
      const layer = node("g", { class: active ? "route editing" : "route" });
      routes.append(layer);
      path(layer, route.points, { stroke: CASING, "stroke-width": "9" });
      path(layer, route.points, {
        stroke: color,
        "stroke-width": "4.5",
        class: "route-line",
        ...(route.draft && !active ? { "stroke-dasharray": "10 8" } : {}),
      });
      path(layer, route.points, { class: "route-flow" });
      path(layer, route.points, { stroke: CASING, "stroke-width": "8" }, true);
      path(layer, route.points, { stroke: color, "stroke-width": "4" }, true);
      if (active) {
        const from = route.points.at(-1);
        if (from)
          this.preview = {
            from,
            element: path(layer, [], {
              stroke: color,
              "stroke-width": "2.5",
              "stroke-dasharray": "4 6",
              class: "route-preview",
            }),
          };
      }
      const start = route.points[0];
      if (start) {
        const { element, body } = pin(layer, start);
        element.classList.add("route-start");
        body.append(
          node("circle", { r: "8", fill: color, stroke: CASING, "stroke-width": "3" }),
        );
        label(element, route.name, 13, -11);
      }
      const end = route.points.at(-1);
      if (end && route.points.length > 1) {
        const { body } = pin(layer, end);
        body.append(
          node("rect", {
            x: "-7",
            y: "-7",
            width: "14",
            height: "14",
            rx: "3",
            fill: CASING,
            stroke: color,
            "stroke-width": "3",
          }),
        );
      }
    }
    const checkpoints = group("checkpoints");
    path(checkpoints, state.checkpoints.map((c) => c.point), {
      stroke: "#ffb15c",
      "stroke-width": "2.5",
      "stroke-dasharray": "6 6",
    });
    for (const checkpoint of state.checkpoints) {
      const { element, body } = pin(checkpoints, checkpoint.point);
      body.append(
        node("circle", { r: "8", fill: "#ffb15c", stroke: CASING, "stroke-width": "2.5" }),
        node("path", {
          d: "M-3.5,0.2L-1,2.7 3.8,-2.4",
          fill: "none",
          stroke: CASING,
          "stroke-width": "2.2",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
      );
      label(element, checkpoint.label, 13, -11);
    }
    const places = group("places");
    for (const marker of state.markers) {
      const { color } = markerKinds[marker.kind] ?? markerKinds.bookmark;
      const glyph = glyphs[marker.kind] ?? glyphs.bookmark;
      const { element, body } = pin(places, marker.point);
      body.append(
        node("circle", { r: "11", fill: color, stroke: CASING, "stroke-width": "2.5" }),
        node("path", {
          d: glyph.d,
          fill: glyph.fill ? CASING : "none",
          stroke: CASING,
          "stroke-width": glyph.fill ? "0.8" : "2",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
      );
      label(element, marker.label);
    }
    if (state.position) {
      const { element, body } = pin(group("position"), state.position.point);
      body.append(
        node("circle", { r: "20", class: "position-halo" }),
        node("circle", { r: "8", fill: "#c18bff", stroke: "#fff", "stroke-width": "2.5" }),
      );
      label(element, "You (estimate)", 13, -12);
    }
  }
  draw(camera: Camera, viewport: Size) {
    this.svg.setAttribute(
      "viewBox",
      `0 0 ${viewport.width} ${viewport.height}`,
    );
    for (const path of this.paths) {
      let d = "";
      for (const [i, point] of path.points.entries()) {
        const p = worldToScreen(camera, point);
        const x = p.x.toFixed(1),
          y = p.y.toFixed(1);
        // Zero-length round-capped segments render as vertex dots.
        d += path.dots ? `M${x},${y}h0` : `${i ? "L" : "M"}${x},${y}`;
      }
      path.element.setAttribute("d", d);
    }
    if (this.preview) {
      const p = worldToScreen(camera, this.preview.from);
      this.preview.element.setAttribute(
        "d",
        `M${p.x.toFixed(1)},${p.y.toFixed(1)}L${viewport.width / 2},${viewport.height / 2}`,
      );
    }
    for (const pin of this.points) {
      const p = worldToScreen(camera, pin.point);
      const outside =
        p.x < -150 ||
        p.y < -100 ||
        p.x > viewport.width + 100 ||
        p.y > viewport.height + 100;
      pin.element.setAttribute("transform", `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      pin.element.style.display = outside ? "none" : "";
    }
  }
  dispose() {
    this.svg.replaceChildren();
  }
}
