# Map Viewer

A mobile-first, private, offline PWA for exploring large local maps. No accounts, uploads, backend, external fonts, analytics, or runtime CDN dependencies.

## Run

```sh
npm install
npm run dev
```

Development: **http://localhost:5173**. The development server intentionally does not install a service worker.

To test installation and offline use, run the production build:

```sh
npm run build
npm run preview
```

Production preview: **http://localhost:4173**. Wait for **Offline ready**, import a map, then go offline and reload. Keep the same origin/port: browser storage belongs to the origin. Build output is in `dist/` and can be served by any static HTTPS host.

### On an iPhone or Android device

An ordinary `http://192.168…` LAN address is **not** a secure context; service workers and OPFS require HTTPS (desktop `localhost` is an exception). Use a trusted development certificate for your computer's LAN address, trust its issuing certificate on the phone, then:

```sh
npm run build
MAP_VIEWER_HTTPS_CERT=/absolute/path/cert.pem \
MAP_VIEWER_HTTPS_KEY=/absolute/path/key.pem npm run preview
```

Open the HTTPS LAN URL shown by Vite. In Safari, Share → Add to Home Screen; in Chrome, menu → Install app. Wait for Offline ready and finish importing before enabling Airplane Mode. Safari/iOS 17+ is the recommended minimum; current Android Chrome and desktop Safari/Chrome/Firefox are the development targets.

## Project structure

```text
src/
  main.ts                   Library, import progress, dialogs, fullscreen UI
  style.css                 Responsive dark UI and safe-area layout
  storage/
    database.ts             IndexedDB metadata + transaction commits
    payloads.ts             OPFS / IndexedDB payload abstraction, deletion
    navigation.ts           Saved camera, notes/routes, settings, throttled writes
    verify.ts / .worker.ts  Offline tile inventory + sequential decode checks
  processing/
    headers.ts              Container metadata without decoding pixels
    import.ts               Worker lifecycle, cancellation, quota preflight
    import.worker.ts        Local preprocessing and final metadata commit
    jpeg.ts                 WASM scanline decoder, OPFS scratch handles
    png.ts                  Streamed inflate, filters, packed/16-bit pixels
    tiles.ts                Reusable scanline band and sequential parent tiles
    pyramid.ts              Resolution and tile inventory
  viewer/
    camera.ts               Fit, constraints, zoom anchoring, visible tiles
    interactions.ts         Pointer pinch/pan, wheel, double tap, inertia
    cache.ts                Byte-limited LRU, two decodes, obsolete queue removal
    viewer.ts               Viewport canvas, level selection, diagnostics
    navigation.ts           Map tools data in original-image coordinates
    overlays.ts             SVG markers/routes, independent of color inversion
    orientation.ts          Best-effort device orientation lock + honest fallback
  ui/
    viewer-markup.ts         Touch controls, tools panel, local note forms
    viewer-controls.ts       Navigation commands, dialogs and persistence
  pwa.ts                    Production service-worker registration
public/
  manifest.webmanifest
  icons/                    Local PNG home-screen icons + SVG favicon
  codecs/                   Shipped JPEG JS/WASM + third-party license
native/                     Rebuildable libjpeg wrapper and OPFS memory manager
scripts/                    SW build, icons, fixtures, decoder rebuild, benchmarks
tests/                      Decoder, tile, camera, cache, storage, offline tests
docs/                       Architecture details and recorded benchmark results
```

## Large-image architecture

See [architecture.md](docs/architecture.md) for implementation details and budgets. The viewer **never opens the original image**. It renders a viewport-sized canvas from locally stored 512 × 512 lossless PNG tiles in a factor-of-two pyramid.

- JPEG is decoded a scanline at a time by a small vendored libjpeg-turbo WASM codec. OPFS synchronous file handles stream the compressed input. Progressive JPEG coefficient arrays spill into temporary files instead of consuming RAM proportional to image area.
- Non-interlaced PNG is inflated in small compressed chunks, unfiltered one row at a time, and converted into a reusable 512-row tile band. No full-resolution RGBA bitmap/canvas is created.
- Each lower resolution reads one already-stored child tile at a time. Resolutions are not simultaneously decoded.
- A 9k image uses a 17.6 MiB scanline band, versus approximately 309 MiB for a full RGBA image. The JPEG heap starts at 32 MiB and has a 96 MiB hard ceiling; coefficient buffers target 12 MiB.
- Viewing retains at most 24 MiB of decoded cached tiles, a ≤1 MiB overview, two tile decodes in flight, and a ≤16 MiB display canvas. Native codec/GPU/encoder overhead is additional. At very large display sizes the chosen level can be coarser to preserve the cache budget.

The original remains locally stored. Metadata is committed as ready **only after** every pyramid tile exists. Cancelled imports are cleaned up; interrupted imports/deletions leave recoverable records. An origin-wide Web Lock prevents another window's startup cleanup from deleting an active import.

## Using the viewer

Drag to pan; pinch to zoom. Wheel/trackpad zoom is centered on the cursor. Double tap/click zooms in; at deep zoom it returns to fit. Everything frequent sits in the thumb zone: a **zoom rail** on the right and a bottom **dock** with **Dark, Layers, Add (+), Saved and More**. Each dock button opens one focused bottom sheet; swipe its header down, tap outside, Close or Escape to dismiss it. **Show whole map** (fit) lives under More, since you usually zoom where you already are. Keyboard: arrows pan, `+`/`−` zoom, `0` or `F` fits; Escape closes the sheet, then finishes the current tool, then returns home. The viewer supports native resolution and up to 400% CSS zoom; native-level pixels are not interpolated when enlarged.

### Cave and quarry tools

- **Dark map (on by default):** the overview tile is analysed once. Light maps are inverted with hue preserved and contrast stretched so the paper becomes **pure black** (OLED pixels off, which saves battery) and the ink stays bright but not glaring. Dark-gray maps have their background deepened to black without inverting. Maps that are already black are left untouched. The margin around the map is also pure black. **More › Map brightness** dims the map further (20–100%). Only the canvas is filtered; the original files and tiles are untouched. This is a software display adjustment, not hardware brightness control.
- **Add (+):** Place, Route, Checkpoint or My position. A crosshair and an action bar replace the dock: tap the map, or aim the crosshair and press the big button. New places get a default name such as "Landmark 3", which follows the kind you pick until you type your own.
- **Planned routes:** Add › Route starts drawing right away. Tap along passages; a dashed preview runs from the last point to the crosshair. Points snap to nearby places and checkpoints, and Undo removes the last one. **Done** saves the route once it has 2 or more points; with fewer, the button reads Cancel and discards the new route (an edited route is restored). Routes get distinct colors with start and end markers. From **Saved › Routes** you can frame a route, continue it, edit its points, rename it or delete it (tap Delete twice).
- **Layers:** show or hide routes, places, checkpoints, your position and names. **Highlight routes & places** darkens the map for a few seconds while every saved item glows and pulses, including hidden layers.
- **Saved:** lists of routes, places (with your position) and checkpoints. Tap a row to jump to it.
- **Manual estimated position:** place or update an explicitly labelled estimate; move or clear it from Saved › Places. There is no GPS or automatic underground tracking.
- **Confirmed checkpoints:** record a recognized place with a name and time. Confirmation updates the manual position estimate. Dashed lines connect recorded points in order; they do not follow passages or provide turn-by-turn directions.
- **Offline check:** from the library, check all maps; from the viewer, use More › Offline access. The app checks cached shell files and reads/decodes every prepared tile in a worker, one at a time. Progress, cancellation, missing/damaged tile errors and the last successful check time are shown. This check uses local storage only.
- **Resume:** reopening the app restores the last map and its center, zoom and rotation. Going home retains each map's camera but opens the library on the next launch.
- **Field controls:** touch lock (top right) freezes gestures, wheel and keyboard movement and needs a one-second hold to unlock; it stays enabled after reopening. Map rotation is locked by default; unlocking it in More enables two-finger twist, a rotation slider and 15° buttons. **Reset to north up** works even while rotation is locked. Pan buttons are also under More.

**Phone orientation is separate from map rotation.** The device-lock button requests the browser's Screen Orientation API, entering fullscreen when needed. Support/permission varies; on unsupported or denied requests the app tells you to use your phone's system rotation lock. Map rotation lock works independently. Device lock is released when leaving the viewer and must be requested again next time.

Notes, routes, checkpoints, camera and display settings are saved locally in a separate IndexedDB store. Camera writes are throttled and flushed on home, visibility changes and pagehide. Abrupt OS termination can still lose the latest uncommitted change. See [validation.md](docs/validation.md) for the physical-device acceptance checklist.

## Test

```sh
npm test
npm run build
npm run fixtures                           # 1k, 4k, 9k, 15k PNGs; Python stdlib
npm run benchmark -- fixtures/map-9000.png
npm run benchmark -- fixtures/map-15000.png
```

For JPEG and denser fixtures, use Pillow **only on the development machine**:

```sh
python3 -m venv /tmp/map-viewer-fixtures
/tmp/map-viewer-fixtures/bin/pip install Pillow
/tmp/map-viewer-fixtures/bin/python scripts/generate-fixtures.py --jpeg --sizes 1000 4000 9000
/tmp/map-viewer-fixtures/bin/python scripts/generate-detail-fixture.py
npm run benchmark -- fixtures/map-9000-detail-progressive.jpg
```

Fixture generation intentionally allocates large host images for JPEG encoding. It is not application code. The PNG-only generator streams rows and has no dependencies. Large fixtures are excluded from source control.

The benchmark runs production JPEG/PNG scanline decoding, the full tile pyramid, pixel checks at edges/interior, and cleanup through a Node filesystem/native-canvas adapter. Run one file per process for comparable process-memory measurements. Recorded results and their limits are in [validation.md](docs/validation.md). These tests do **not** claim real Safari memory, GPU, FPS, installation, or touch-device validation.

For device profiling, `window.MapViewer.diagnostics()` reports decoded tile bytes, display canvas bytes, queued tiles, zoom, rendered frames, and average interval of active frames. `window.MapViewer.library()` includes import duration, tile bytes, and decoder. Use remote Safari/Chrome profiling for actual process memory and frame pacing; JavaScript heap size alone misses native allocations.

## Current limits

- Maximum: 256 MiB original, 300 megapixels, 32,768 pixels per side. Wider inputs would need a different band layout.
- WebP and interlaced PNG use the native decoder and are limited to 16 megapixels. Large maps must currently be JPEG or **non-interlaced** PNG.
- Without worker OPFS synchronous handles, the IndexedDB fallback supports baseline JPEG originals up to 64 MiB and progressive JPEG up to 4 MP. Streaming PNG still supports large maps. Large progressive JPEG needs OPFS.
- JPEG EXIF rotation must already be applied to the pixels. Non-standard/12-bit JPEG, animations, PDF, TIFF, and future features are not supported.
- Pixels become display-oriented RGBA8. Embedded ICC profiles, PNG gamma and high-bit-depth fidelity are not handled by the streaming decoders.
- Lossless tile storage can substantially exceed original size. A detailed 27.4 MiB JPEG used 168.4 MiB of tiles plus temporary coefficient files of 232.2 MiB during processing. A quota preflight is only an estimate; actual quota errors are handled and rolled back.
- Import must remain in the foreground until complete. Mobile browsers can suspend workers or kill a PWA in the background. Interrupted work is cleaned up at next launch rather than resumed.
- Browser storage is origin-local. `persist()` is requested but can be refused. Clearing website data, storage eviction, or uninstall behavior can remove imported maps; keep your source files. HTTPS, hostname, and port changes create a different library.
- The shell is precached atomically, including the worker and WASM. Updates wait until the old app windows close. Deployment currently assumes the origin root, not a subdirectory.
- Real iOS/Android installation, Airplane Mode cold launch, process-memory ceilings, and sustained touch FPS still require physical-device validation.
- Device orientation locking is best effort; map rotation locking is application-controlled. Checkpoints and routes are manually entered, without positioning sensors, pathfinding or scale calibration.

## Next improvement

Profile the existing pipeline on a real iPhone with the 9k detailed progressive JPEG and 15k PNG before increasing format support. Use those results to tune band/cache budgets and tile encoding. Then add a streaming WebP/Adam7 PNG decoder so every supported input format can use the same bounded-memory import path.

## Rebuild the JPEG codec (optional)

The generated codec is included, so normal development needs no C toolchain. With Emscripten 4.0.16, CMake, and Git available:

```sh
./scripts/build-codec.sh
npm run build
```

The script pins libjpeg-turbo 3.1.2. The source wrappers are in `native/`; licensing is included in `public/codecs/LICENSE-libjpeg.txt`. There are zero production npm dependencies; the canvas and IndexedDB adapters are test-only development dependencies.
