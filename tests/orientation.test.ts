import test from "node:test";
import assert from "node:assert/strict";
import {
  lockDeviceOrientation,
  unlockDeviceOrientation,
} from "../src/viewer/orientation";

test("device orientation reports unsupported/denied requests honestly and rolls back fullscreen", async () => {
  let fullscreen = false,
    exits = 0,
    requested = "",
    rejectLock = false;
  const target = {
    requestFullscreen: async () => {
      fullscreen = true;
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get fullscreenElement() {
        return fullscreen ? target : null;
      },
      exitFullscreen: async () => {
        fullscreen = false;
        exits++;
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      innerWidth: 390,
      innerHeight: 844,
      matchMedia: () => ({ matches: false }),
    },
  });
  Object.defineProperty(globalThis, "screen", {
    configurable: true,
    value: { orientation: {} },
  });
  const unsupported = await lockDeviceOrientation(
    target as unknown as HTMLElement,
  );
  assert.equal(unsupported.locked, false);
  assert.match(unsupported.message, /system rotation lock/);
  assert.equal(fullscreen, false);
  Object.assign(screen.orientation, {
    lock: async (direction: string) => {
      requested = direction;
      if (rejectLock) throw new Error("denied");
    },
    unlock: () => {
      if (rejectLock) throw new Error("denied");
    },
  });
  const supported = await lockDeviceOrientation(
    target as unknown as HTMLElement,
  );
  assert.equal(supported.locked, true);
  assert.equal(supported.enteredFullscreen, true);
  assert.equal(requested, "portrait");
  assert.equal(unlockDeviceOrientation(), true);
  fullscreen = false;
  rejectLock = true;
  const denied = await lockDeviceOrientation(target as unknown as HTMLElement);
  assert.equal(denied.locked, false);
  assert.equal(denied.enteredFullscreen, false);
  assert.equal(fullscreen, false);
  assert.equal(exits, 1);
  assert.equal(unlockDeviceOrientation(), false);
});
