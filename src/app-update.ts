// Bound network and lifecycle waits so a failed update leaves the current app usable.
async function withTimeout<T>(work: Promise<T>, milliseconds = 30_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("The update timed out. Check your connection and try again.")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Activation and control are separate: reload only once the new worker owns this page.
async function waitForControl(worker: ServiceWorker, container: ServiceWorkerContainer) {
  let check = () => {};
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      check = () => {
        if (worker.state === "redundant")
          reject(new Error("The update could not be installed. Your saved data is unchanged."));
        else if (worker.state === "activated" && container.controller === worker)
          resolve();
        else if (worker.state === "installed")
          worker.postMessage({ type: "skip-waiting" });
      };
      worker.addEventListener("statechange", check);
      container.addEventListener("controllerchange", check);
      check();
    }));
  } finally {
    worker.removeEventListener("statechange", check);
    container.removeEventListener("controllerchange", check);
  }
}

async function shellVersion(worker: ServiceWorker) {
  const channel = new MessageChannel();
  try {
    return await withTimeout(new Promise<string>((resolve, reject) => {
      channel.port1.onmessage = (event: MessageEvent<{ ready: boolean; version?: string }>) => {
        if (!event.data.ready || !event.data.version)
          reject(new Error("The updated app is not ready for offline use. Try again while online."));
        else resolve(event.data.version);
      };
      worker.postMessage({ type: "verify-shell" }, [channel.port2]);
    }), 10_000);
  } finally {
    channel.port1.close();
    channel.port2.close();
  }
}

// Updating replaces only the application shell; IndexedDB and map files are untouched.
export async function checkForAppUpdate(
  loadedVersion: string,
  container: ServiceWorkerContainer = navigator.serviceWorker,
) {
  const registration = await withTimeout(container.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  }));
  await withTimeout(registration.update());
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw new Error("The app update is not ready. Try again while online.");
  await waitForControl(worker, container);
  return (await shellVersion(worker)) !== loadedVersion;
}
