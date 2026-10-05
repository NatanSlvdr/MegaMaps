import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { payloadStore, deleteStoredMap } from "../src/storage/payloads";
import { listMaps, saveMap } from "../src/storage/database";
import type { MapRecord } from "../src/types";
test("fallback payloads persist and deleting one map preserves its neighbour", async () => {
  const store = payloadStore("indexeddb");
  await store.put("a", "original", new Blob(["a"]));
  await store.put("a", "0-0-0.png", new Blob(["tile"]));
  await store.put("ab", "original", new Blob(["neighbour"]));
  assert.equal(await (await store.get("a", "original")).text(), "a");
  const map: MapRecord = {
    id: "a",
    name: "map",
    width: 1,
    height: 1,
    bytes: 1,
    backend: "indexeddb",
    levels: [],
    created: 0,
    status: "importing",
  };
  await saveMap(map);
  assert.equal(
    (await listMaps()).find((m) => m.id === "a")?.status,
    "importing",
  );
  await deleteStoredMap(map);
  await assert.rejects(store.get("a", "original"));
  await assert.rejects(store.get("a", "0-0-0.png"));
  assert.equal(await (await store.get("ab", "original")).text(), "neighbour");
  assert.ok(!(await listMaps()).some((m) => m.id === "a"));
  await store.deleteMap("ab");
});
