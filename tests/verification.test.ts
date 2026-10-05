import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { installPlatform, nativeStats } from "./node-platform";
import { payloadStore } from "../src/storage/payloads";
import type { MapRecord } from "../src/types";
import type { VerificationReply } from "../src/storage/verify.worker";
const context = globalThis as unknown as {
  onmessage: (event: MessageEvent<MapRecord>) => Promise<void>;
  postMessage: (message: VerificationReply) => void;
};
test("verification reads/decodes every local tile, closes it, rejects damage and missing tiles", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "map-viewer-verify-"));
  await installPlatform(root);
  const replies: VerificationReply[] = [];
  Object.defineProperty(globalThis, "onmessage", {
    value: null,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "postMessage", {
    value: (reply: VerificationReply) => replies.push(reply),
    writable: true,
    configurable: true,
  });
  const map: MapRecord = {
    id: "verify",
    name: "map.png",
    width: 512,
    height: 512,
    bytes: 1,
    backend: "opfs",
    created: 0,
    status: "ready",
    levels: [{ width: 512, height: 512, cols: 1, rows: 1, scale: 1 }],
  };
  try {
    await import("../src/storage/verify.worker");
    const store = payloadStore("opfs");
    const canvas = createCanvas(512, 512);
    await store.put(
      "verify",
      "0-0-0.png",
      new Blob([new Uint8Array(await canvas.encode("png"))]),
    );
    await context.onmessage(new MessageEvent("message", { data: map }));
    assert.equal(replies.at(-1)?.type, "done");
    assert.equal(nativeStats.decodedBytes, 0);
    assert.ok(nativeStats.peakDecodedBytes <= 1048576);
    replies.length = 0;
    await store.put("verify", "0-0-0.png", new Blob(["corrupt"]));
    await context.onmessage(new MessageEvent("message", { data: map }));
    assert.equal(replies.at(-1)?.type, "error");
    await store.deleteMap("verify");
    replies.length = 0;
    await context.onmessage(new MessageEvent("message", { data: map }));
    assert.equal(replies.at(-1)?.type, "error");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
