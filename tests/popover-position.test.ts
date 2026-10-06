import test from "node:test";
import assert from "node:assert/strict";
import { popoverPosition } from "../src/ui/popover-position";

const bounds = { left: 10, top: 300, right: 380, bottom: 740 };
const size = { width: 216, height: 160 };

test("saved menu opens below its anchor, or above near the panel's bottom", () => {
  const below = popoverPosition({ left: 320, top: 380, right: 360, bottom: 420 }, bounds, size);
  assert.equal(below.top, 424);
  assert.equal(below.left, 144);
  const above = popoverPosition({ left: 320, top: 675, right: 360, bottom: 715 }, bounds, size);
  assert.equal(above.top, 511);
  assert.ok(above.top + size.height < 675);
});

test("saved menu stays reachable when a short panel cannot fit it above or below", () => {
  const short = { left: 10, top: 500, right: 380, bottom: 700 };
  const position = popoverPosition({ left: 320, top: 575, right: 360, bottom: 615 }, short, size);
  assert.ok(position.top >= short.top + 8);
  assert.ok(position.top + size.height <= short.bottom - 8);
});

test("saved menu constrains its width and scroll height on a small viewport", () => {
  const small = { left: 10, top: 100, right: 190, bottom: 230 };
  const position = popoverPosition({ left: 140, top: 150, right: 180, bottom: 190 }, small, size);
  assert.equal(position.width, 164);
  assert.equal(position.maxHeight, 114);
  assert.equal(position.left, 18);
  assert.equal(position.top, 108);
});
