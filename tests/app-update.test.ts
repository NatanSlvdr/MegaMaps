import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { checkForAppUpdate } from "../src/app-update";

class Worker extends EventTarget {
  state: ServiceWorkerState = "activated";
  ready = true;
  skipRequested = false;
  constructor(readonly version: string) { super(); }
  postMessage(message: { type: string }, ports?: MessagePort[]) {
    if (message.type === "skip-waiting") this.skipRequested = true;
    if (message.type === "verify-shell")
      ports?.[0]?.postMessage({ ready: this.ready, version: this.version });
  }
  transition(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

function environment(worker: Worker, update = async () => {}) {
  const container = Object.assign(new EventTarget(), {
    controller: worker as Worker | null,
    async register(url: string, options: RegistrationOptions) {
      assert.equal(url, "/sw.js");
      assert.equal(options.updateViaCache, "none");
      return registration;
    },
  });
  const registration = {
    active: worker as Worker | null,
    installing: null as Worker | null,
    waiting: null as Worker | null,
    update,
  };
  return {
    container,
    registration,
    check: (loaded: string) => checkForAppUpdate(loaded, container as unknown as ServiceWorkerContainer),
  };
}

test("update detects both an already current page and an older page with a newer active worker", async () => {
  const app = environment(new Worker("build-two"));
  assert.equal(await app.check("build-two"), false);
  assert.equal(await app.check("build-one"), true);
});

test("update waits for installation and page control before permitting a reload", async () => {
  const worker = new Worker("new");
  worker.state = "installing";
  const app = environment(worker);
  app.container.controller = new Worker("old");
  app.registration.installing = worker;
  let finished = false;
  const pending = app.check("old").then((result) => { finished = true; return result; });
  await setImmediate();
  assert.equal(finished, false);
  worker.transition("installed");
  assert.equal(worker.skipRequested, true);
  worker.transition("activated");
  await setImmediate();
  assert.equal(finished, false, "activation alone is not enough");
  app.container.controller = worker;
  app.container.dispatchEvent(new Event("controllerchange"));
  assert.equal(await pending, true);
});

test("offline checks, failed installs and incomplete shells fail without requesting a reload", async () => {
  const offline = environment(new Worker("old"), async () => { throw new Error("Offline"); });
  await assert.rejects(offline.check("old"), /Offline/);
  const failed = new Worker("new");
  failed.state = "redundant";
  await assert.rejects(environment(failed).check("old"), /could not be installed/);
  const incomplete = new Worker("new");
  incomplete.ready = false;
  await assert.rejects(environment(incomplete).check("old"), /not ready for offline use/);
});
