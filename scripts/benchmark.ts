import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { openAsBlob } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import {
  installPlatform,
  jpegFactory,
  nativeStats,
} from "../tests/node-platform";
import { readHeader } from "../src/processing/headers";
import { decodePNG } from "../src/processing/png";
import { decodeJPEG } from "../src/processing/jpeg";
import { tileBand, buildParents } from "../src/processing/tiles";
import { pyramid, tileCount } from "../src/processing/pyramid";
import { payloadStore } from "../src/storage/payloads";
import { tileKey, TILE_SIZE } from "../src/types";

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.log(
    "Usage: npm run benchmark -- fixtures/map-9000.png (one process per file for clean RSS)",
  );
  process.exit(1);
}
const root = path.join(tmpdir(), `map-viewer-benchmark-${randomUUID()}`);
await installPlatform(root);
const results = [];
try {
  for (const name of inputs) {
    const file = await openAsBlob(name);
    const header = await readHeader(file),
      levels = pyramid(header.width, header.height);
    const id = randomUUID(),
      store = payloadStore("opfs");
    await store.put(id, "original", file);
    const initialRSS = process.memoryUsage().rss;
    let tiles = 0,
      bytes = 0,
      peakRSS = initialRSS,
      peakHeap = 0;
    const start = performance.now();
    const sample = () => {
      peakRSS = Math.max(peakRSS, process.memoryUsage().rss);
      peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    };
    const tracking = {
      get: store.get.bind(store),
      deleteMap: store.deleteMap.bind(store),
      async put(id: string, key: string, blob: Blob) {
        bytes += blob.size;
        await store.put(id, key, blob);
      },
    };
    const canvas = new OffscreenCanvas(1, 1);
    const consume = tileBand(header, canvas, tracking, id, () => {
      tiles++;
      sample();
    });
    const samples = new Map<number, number[]>();
    const checkpoints = [
      0,
      127,
      511,
      512,
      Math.floor(header.height / 2),
      header.height - 1,
    ];
    const rowConsumer = async (row: Uint8ClampedArray, y: number) => {
      if (checkpoints.includes(y))
        for (const x of [
          0,
          127,
          511,
          512,
          Math.floor(header.width / 2),
          header.width - 1,
        ].filter((x) => x < header.width))
          samples.set(y * header.width + x, [
            ...row.subarray(x * 4, x * 4 + 4),
          ]);
      await consume(row, y);
      if (y % 64 === 0) sample();
    };
    if (header.format === "png") await decodePNG(file, header, rowConsumer);
    else if (header.format === "jpeg")
      await decodeJPEG(file, header, id, "opfs", rowConsumer, jpegFactory);
    else throw new Error("Benchmark accepts streaming JPEG/PNG.");
    if (
      nativeStats.scratchAllocatedBytes !== 0 ||
      (await readdir(path.join(root, "maps", id))).some((name) =>
        name.startsWith("scratch-"),
      )
    )
      throw new Error("JPEG scratch handles/files were not cleaned up.");
    if (
      header.progressive &&
      header.width * header.height > 16_000_000 &&
      nativeStats.peakScratchBytes === 0
    )
      throw new Error(
        "Large progressive JPEG did not exercise coefficient spill.",
      );
    const baseMs = performance.now() - start;
    await buildParents(levels, canvas, tracking, id, () => {
      tiles++;
      sample();
    });
    const importMs = performance.now() - start;
    if (tiles !== tileCount(levels))
      throw new Error("Tile inventory mismatch.");
    // Verify sampled source scanlines survived lossless native-level tile encoding.
    for (const [index, expected] of samples) {
      const x = index % header.width,
        y = Math.floor(index / header.width);
      const image = await loadImage(
        Buffer.from(
          await (
            await store.get(
              id,
              tileKey(0, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)),
            )
          ).arrayBuffer(),
        ),
      );
      const test = createCanvas(image.width, image.height),
        ctx = test.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const actual = [
        ...ctx.getImageData(x % TILE_SIZE, y % TILE_SIZE, 1, 1).data,
      ];
      if (actual.some((value, i) => value !== expected[i]))
        throw new Error(`Pixel mismatch at ${x},${y}`);
    }
    const result = {
      file: name,
      width: header.width,
      height: header.height,
      progressive: header.progressive ?? false,
      originalMiB: file.size / 1048576,
      tileCount: tiles,
      tileMiB: bytes / 1048576,
      baseSeconds: baseMs / 1000,
      importSeconds: importMs / 1000,
      initialNodeRSSMiB: initialRSS / 1048576,
      peakNodeRSSMiB: peakRSS / 1048576,
      wasmHeapMiB: nativeStats.wasmHeapBytes / 1048576,
      peakScratchMiB: nativeStats.peakScratchBytes / 1048576,
      scratchWriteMiB: nativeStats.scratchWriteBytes / 1048576,
      peakJSHeapMiB: peakHeap / 1048576,
      peakConcurrentChildDecodedMiB: nativeStats.peakDecodedBytes / 1048576,
      bandMiB: (header.width * Math.min(512, header.height) * 4) / 1048576,
      losslessSampleCount: samples.size,
      platform: "Node + native-canvas adapter; not Safari, excludes device GPU",
    };
    console.log(JSON.stringify(result, null, 2));
    results.push(result);
    await store.deleteMap(id);
  }
  await mkdir("fixtures", { recursive: true });
  await writeFile(
    `fixtures/benchmark-${Date.now()}.json`,
    JSON.stringify(results, null, 2),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
