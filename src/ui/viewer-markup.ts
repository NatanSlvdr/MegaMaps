import { icons } from "./icons";
import { markerKinds } from "../viewer/navigation";

const layerChip = (id: string, label: string, icon: string) =>
  `<label class="layer-chip ${id}"><input type="checkbox" role="switch" id="layer-${id}">${icon}<span>${label}</span><small id="layer-${id}-count"></small></label>`;
const kindChips = Object.entries(markerKinds)
  .map(
    ([kind, { label, color }]) =>
      `<label class="chip"><input type="radio" name="marker-kind" value="${kind}"><span><i style="background:${color}"></i>${label}</span></label>`,
  )
  .join("");
const setting = (
  icon: string,
  tint: string,
  title: string,
  detail: string,
  action = "",
) =>
  `<span class="setting-row"><i class="setting-icon ${tint}">${icon}</i><span class="setting-text"><strong>${title}</strong>${detail}</span>${action}</span>`;

// Glass HUD: the map runs edge to edge under small translucent pills.
// Controls are grouped by intent:
//   right rail  – move around the map (compass, my position, zoom)
//   dock left   – how the map looks (View sheet, Highlight)
//   dock center – create (Add)
//   dock right  – your things and the device (Saved, Settings)
export const viewerMarkup = `
<div class="map-stage" id="map-stage"><canvas id="map-canvas" tabindex="0" aria-label="Map: drag to pan; pinch, scroll or double-tap and drag to zoom; long-press to add a place. Arrows pan, plus and minus zoom, F fits."></canvas><div class="map-shade" aria-hidden="true"></div><svg id="map-overlay" class="map-overlay" aria-hidden="true"></svg></div>
<header class="hud-top">
  <button class="glass hud-round" id="back" aria-label="Return to library">${icons.arrow}</button>
  <div class="glass hud-title"><span id="viewer-title"></span><output id="zoom" aria-label="Current zoom">100%</output></div>
  <button class="glass hud-round" id="touch-lock" aria-label="Lock touches" aria-pressed="false">${icons.lock}</button>
</header>
<p id="toast" class="toast glass" role="status" aria-live="polite" hidden></p>
<div class="map-rail" id="zoom-rail">
  <button id="compass" class="glass hud-round" aria-label="Map rotated. Reset to north up" hidden>${icons.north}</button>
  <div class="glass rail-group">
    <button id="locate" aria-label="Go to my position">${icons.position}</button>
    <button id="zoom-in" aria-label="Zoom in">${icons.plus}</button>
    <button id="zoom-out" aria-label="Zoom out">${icons.minus}</button>
  </div>
</div>
<nav class="dock" id="dock" aria-label="Map actions">
  <div class="glass dock-group">
    <button id="open-display" data-sheet="display" aria-controls="sheet" aria-expanded="false" aria-label="View: dark map, brightness, layers">${icons.layers}</button>
    <button id="spotlight" aria-label="Highlight routes and places">${icons.sparkle}</button>
  </div>
  <button id="open-add" class="dock-add" data-sheet="add" aria-controls="sheet" aria-expanded="false" aria-label="Add to map">${icons.plus}</button>
  <div class="glass dock-group">
    <button id="open-saved" data-sheet="saved" aria-controls="sheet" aria-expanded="false" aria-label="Saved routes and places">${icons.list}</button>
    <button id="open-more" data-sheet="more" aria-controls="sheet" aria-expanded="false" aria-label="Settings">${icons.gear}</button>
  </div>
</nav>
<div id="touch-locked" class="touch-locked glass" hidden>
  <i class="locked-icon">${icons.lock}</i><span>Locked<small id="unlock-hint">Hold 1 second</small></span>
  <button id="unlock-view" aria-describedby="unlock-hint">Hold to unlock</button>
</div>
<div id="tool-bar" class="tool-bar" hidden>
  <p class="glass tool-hint"><strong id="tool-title"></strong><span id="tool-message"></span></p>
  <div class="tool-actions">
    <button id="tool-done" class="glass tool-done"><span class="if-cancel">${icons.close}</span><span class="if-done">${icons.check}</span><span id="tool-done-label">Cancel</span></button>
    <button id="tool-center" class="tool-primary">${icons.plus}<span id="tool-center-label">Place here</span></button>
    <button id="route-undo" class="glass tool-undo" aria-label="Undo last point">${icons.undo}</button>
  </div>
</div>
<span id="placement-center" class="placement-center" aria-hidden="true" hidden></span>
<button id="sheet-dismiss" class="sheet-dismiss" aria-label="Close" tabindex="-1" hidden></button>
<section id="sheet" class="sheet" aria-labelledby="sheet-title" hidden>
  <div class="sheet-grabber" id="sheet-grabber"><span></span></div>
  <div class="sheet-header"><h2 id="sheet-title"></h2><button id="close-sheet" class="sheet-close" aria-label="Close">${icons.close}</button></div>
  <div class="sheet-content">
    <div id="sheet-add" data-panel="add" data-title="Add to map" hidden>
      <div class="add-grid">
        <button id="add-route" class="add-tile"><i class="tile-icon routes">${icons.route}</i><strong>Route</strong><small>Tap along passages</small></button>
        <button id="add-marker" class="add-tile"><i class="tile-icon places">${icons.pin}</i><strong>Place</strong><small>Entrance, junction, note…</small></button>
        <button id="add-checkpoint" class="add-tile"><i class="tile-icon checkpoints">${icons.checkpoint}</i><strong>Checkpoint</strong><small>A spot you recognize</small></button>
        <button id="set-position" class="add-tile"><i class="tile-icon position">${icons.position}</i><strong>My position</strong><small>Your best estimate</small></button>
      </div>
      <p class="sheet-tip">${icons.hand}<span>Or long-press the map to drop a place.</span></p>
    </div>
    <div id="sheet-display" data-panel="display" data-title="View" hidden>
      <div class="quick-grid">
        <label class="quick-tile"><input type="checkbox" role="switch" id="dark-map">${icons.moon}<span>Dark map</span></label>
        <label class="quick-tile"><input type="checkbox" role="switch" id="rotation-lock">${icons.rotationLock}<span>Lock rotation</span></label>
        <button id="fit" class="quick-tile">${icons.fit}<span>Whole map</span></button>
      </div>
      <p id="dark-status" class="field-help"></p>
      <div class="slider-row">${icons.sunDim}<input id="map-dimming" aria-label="Map brightness" type="range" min="20" max="100" step="5">${icons.sun}<output id="dimming-value">100%</output></div>
      <div id="rotation-controls" class="slider-row"><button id="rotate-left" class="slider-step" aria-label="Rotate map left 15 degrees">${icons.rotateLeft}</button><input id="rotation-angle" aria-label="Map rotation" type="range" min="0" max="359" step="1"><button id="rotate-right" class="slider-step" aria-label="Rotate map right 15 degrees">${icons.rotateRight}</button><output id="rotation-value">0°</output></div>
      <h3>Show on map</h3>
      <div class="layer-chips">
        ${layerChip("routes", "Routes", icons.route)}
        ${layerChip("places", "Places", icons.pin)}
        ${layerChip("checkpoints", "Checkpoints", icons.checkpoint)}
        ${layerChip("position", "My position", icons.position)}
        ${layerChip("labels", "Names", icons.text)}
      </div>
    </div>
    <div id="sheet-saved" data-panel="saved" data-title="Saved" hidden>
      <div class="segmented" role="tablist" aria-label="Saved items">
        <button id="saved-routes" role="tab" aria-controls="saved-list-routes" data-saved="routes">${icons.route}<span>Routes</span><small id="saved-routes-count"></small></button>
        <button id="saved-places" role="tab" aria-controls="saved-list-places" data-saved="places">${icons.pin}<span>Places</span><small id="saved-places-count"></small></button>
        <button id="saved-checkpoints" role="tab" aria-controls="saved-list-checkpoints" data-saved="checkpoints">${icons.checkpoint}<span>Checks</span><small id="saved-checkpoints-count"></small></button>
      </div>
      <div id="saved-list-routes" role="tabpanel" aria-labelledby="saved-routes" class="navigation-list"><div id="route-list"></div></div>
      <div id="saved-list-places" role="tabpanel" aria-labelledby="saved-places" class="navigation-list" hidden><div id="position-row"></div><div id="marker-list"></div></div>
      <div id="saved-list-checkpoints" role="tabpanel" aria-labelledby="saved-checkpoints" class="navigation-list" hidden><p class="field-help">Lines join checkpoints in the order you confirmed them. They are not a path.</p><div id="checkpoint-list"></div></div>
    </div>
    <div id="sheet-more" data-panel="more" data-title="Settings" hidden>
      <div class="setting-group">
        ${setting(icons.offline, "green", "Offline access", `<small id="map-offline-status">Not checked yet.</small>`, `<button id="verify-current-map" class="pill-button">Check</button>`)}
        ${setting(icons.screenRotate, "blue", "Screen orientation", `<small id="orientation-message" role="status">If unavailable, use your phone’s rotation lock.</small>`, `<button id="device-orientation" class="pill-button">Lock</button>`)}
      </div>
      <div class="setting-group">
        <details class="setting-details"><summary>${setting(icons.move, "gray", "Pan buttons", `<small>Move the map without dragging</small>`)}</summary><div class="pan-buttons" aria-label="Pan map"><button data-pan="left" aria-label="Pan left">${icons.arrow}</button><button data-pan="up" aria-label="Pan up"><span class="pan-up">${icons.arrow}</span></button><button data-pan="down" aria-label="Pan down"><span class="pan-down">${icons.arrow}</span></button><button data-pan="right" aria-label="Pan right"><span class="pan-right">${icons.arrow}</span></button></div></details>
        <details class="setting-details"><summary>${setting(icons.hand, "gray", "Gestures", `<small>One-thumb shortcuts</small>`)}</summary><ul class="gesture-list"><li><b>Double-tap and drag</b> down or up to zoom with one thumb.</li><li><b>Long-press</b> the map to add a place.</li><li><b>Double-tap</b> to zoom in.</li><li>Tap the <b>compass</b> to turn north up again.</li></ul></details>
      </div>
      <p id="save-status" class="save-status" role="status">Saved on this device</p>
    </div>
  </div>
</section>
<p id="viewer-error" class="viewer-error" role="alert" hidden></p>
<dialog id="marker-dialog"><form id="marker-form"><h2 id="marker-dialog-title">New place</h2><div class="kind-chips" role="radiogroup" aria-label="Kind">${kindChips}</div><label>Name<input id="marker-label" required maxlength="100" autocomplete="off" enterkeyhint="done"></label><label>Notes <small>optional</small><textarea id="marker-note" maxlength="2000" rows="2"></textarea></label><div class="dialog-actions"><button type="button" id="marker-delete" class="danger" hidden>Delete</button><button type="button" id="marker-cancel" class="secondary">Cancel</button><button type="submit" class="primary">Save</button></div></form></dialog>
<dialog id="name-dialog"><form id="name-form"><h2 id="name-title"></h2><label>Name<input id="name-input" required maxlength="100" autocomplete="off" enterkeyhint="done"></label><div class="dialog-actions"><button type="button" id="name-cancel" class="secondary">Cancel</button><button type="submit" class="primary">Save</button></div></form></dialog>`;
