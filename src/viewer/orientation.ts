type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "portrait" | "landscape") => Promise<void>;
};
// Do not simulate a successful device lock by rotating CSS. Map rotation locking
// is independent; unsupported/denied system requests must be reported honestly.
export async function lockDeviceOrientation(target: HTMLElement) {
  const orientation = screen.orientation as LockableOrientation | undefined;
  if (!orientation?.lock)
    return {
      locked: false,
      enteredFullscreen: false,
      message:
        "This browser cannot lock the device orientation. Use your phone’s system rotation lock. The map rotation lock still works.",
    };
  const direction =
    window.innerWidth > window.innerHeight ? "landscape" : "portrait";
  let enteredFullscreen = false;
  try {
    if (
      !document.fullscreenElement &&
      !window.matchMedia("(display-mode: standalone)").matches &&
      target.requestFullscreen
    ) {
      await target.requestFullscreen();
      enteredFullscreen = true;
    }
    await orientation.lock(direction);
    return {
      locked: true,
      enteredFullscreen,
      message: `Device locked to ${direction}.`,
    };
  } catch {
    if (enteredFullscreen) await document.exitFullscreen().catch(() => {});
    return {
      locked: false,
      enteredFullscreen: false,
      message:
        "Device orientation lock was not allowed. Use your phone’s system rotation lock; map rotation remains independently controlled.",
    };
  }
}
export function unlockDeviceOrientation() {
  try {
    screen.orientation?.unlock?.();
    return true;
  } catch {
    return false;
  }
}
