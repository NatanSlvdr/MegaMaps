import { worldToScreen, type Camera, type Point, type Size } from "./camera";
import type { NavigationState } from "./navigation";
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
// Screen-space SVG keeps lines/labels legible without another raster surface.
// Text is assigned through textContent; imported/user names never become markup.
export class NavigationOverlay {
  private points: { element: SVGGElement; point: Point }[] = [];
  private paths: { element: SVGPathElement; points: Point[] }[] = [];
  constructor(private svg: SVGSVGElement) {}
  rebuild(state: NavigationState) {
    this.svg.replaceChildren();
    this.points = [];
    this.paths = [];
    const path = (points: Point[], color: string, dashed = false) => {
      const element = node("path", {
        fill: "none",
        stroke: color,
        "stroke-width": "3",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        ...(dashed ? { "stroke-dasharray": "8 6" } : {}),
      });
      this.svg.append(element);
      this.paths.push({ element, points });
    };
    const pin = (
      point: Point,
      label: string,
      color: string,
      position = false,
    ) => {
      const element = node("g");
      if (position)
        element.append(
          node("circle", {
            r: "17",
            fill: color,
            "fill-opacity": ".16",
            stroke: color,
            "stroke-width": "1",
            "stroke-dasharray": "3 3",
          }),
        );
      element.append(
        node("circle", {
          r: position ? "7" : "6",
          fill: color,
          stroke: "#111917",
          "stroke-width": "2",
        }),
      );
      const text = node("text", {
        x: "12",
        y: "-12",
        fill: color,
        stroke: "#111917",
        "stroke-width": "4",
        "paint-order": "stroke",
        "font-size": "12",
        "font-weight": "600",
      });
      text.textContent = label;
      element.append(text);
      this.svg.append(element);
      this.points.push({ element, point });
    };
    for (const route of state.routes)
      path(route.points, "#8ed7f1", route.draft);
    path(
      state.checkpoints.map((c) => c.point),
      "#f1c47f",
      true,
    );
    for (const checkpoint of state.checkpoints)
      pin(checkpoint.point, checkpoint.label, "#f1c47f");
    for (const marker of state.markers)
      pin(marker.point, marker.label, "#c5e6a5");
    if (state.position)
      pin(state.position.point, "Estimated · manual", "#dfb8ff", true);
  }
  draw(camera: Camera, viewport: Size) {
    this.svg.setAttribute(
      "viewBox",
      `0 0 ${viewport.width} ${viewport.height}`,
    );
    for (const path of this.paths)
      path.element.setAttribute(
        "d",
        path.points
          .map((point, i) => {
            const p = worldToScreen(camera, point);
            return `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          })
          .join(" "),
      );
    for (const pin of this.points) {
      const p = worldToScreen(camera, pin.point);
      pin.element.setAttribute("transform", `translate(${p.x},${p.y})`);
      pin.element.style.display =
        p.x < -100 ||
        p.y < -100 ||
        p.x > viewport.width + 100 ||
        p.y > viewport.height + 100
          ? "none"
          : "";
    }
  }
  dispose() {
    this.svg.replaceChildren();
  }
}
