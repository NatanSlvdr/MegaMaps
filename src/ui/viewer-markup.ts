import { icons } from "./icons";
import { markerKinds } from "../viewer/navigation";

const layerRow = (id: string, label: string, swatch: string) =>
  `<label class="toggle-row"><span class="layer-label"><i class="swatch ${swatch}"></i>${label}<small id="${id}-count"></small></span><input type="checkbox" role="switch" id="${id}"></label>`;
const kindChips = Object.entries(markerKinds)
  .map(
    ([kind, { label, color }]) =>
      `<label class="chip"><input type="radio" name="marker-kind" value="${kind}"><span><i style="background:${color}"></i>${label}</span></label>`,
  )
  .join("");

// Thumb-first layout: everything frequent sits in the bottom dock or right rail;
// each dock button opens one focused sheet instead of a dense tabbed panel.
export const viewerMarkup = `
<div class="map-stage" id="map-stage"><canvas id="map-canvas" tabindex="0" aria-label="Map: drag to pan; pinch or scroll to zoom. Arrows pan, plus and minus zoom, F fits."></canvas><div class="map-shade" aria-hidden="true"></div><svg id="map-overlay" class="map-overlay" aria-hidden="true"></svg></div>
<header class="viewer-top">
  <button class="viewer-icon-button" id="back" aria-label="Return to library">${icons.arrow}</button>
  <div class="viewer-heading"><span id="viewer-title"></span><output id="zoom" aria-label="Current zoom">100%</output></div>
  <button class="viewer-icon-button" id="touch-lock" aria-label="Lock touches" aria-pressed="false">${icons.lock}</button>
</header>
<p id="toast" class="toast" role="status" aria-live="polite" hidden></p>
<div class="zoom-rail" id="zoom-rail">
  <button id="zoom-in" aria-label="Zoom in">${icons.plus}</button>
  <button id="zoom-out" aria-label="Zoom out">${icons.minus}</button>
</div>
<nav class="dock" id="dock" aria-label="Map actions">
  <button id="quick-dark" aria-pressed="false" aria-label="Dark map">${icons.moon}<span>Dark</span></button>
  <button id="open-layers" data-sheet="layers" aria-controls="sheet" aria-expanded="false">${icons.layers}<span>Layers</span></button>
  <button id="open-add" class="dock-add" data-sheet="add" aria-controls="sheet" aria-expanded="false" aria-label="Add to map">${icons.plus}<span>Add</span></button>
  <button id="open-saved" data-sheet="saved" aria-controls="sheet" aria-expanded="false">${icons.list}<span>Saved</span></button>
  <button id="open-more" data-sheet="more" aria-controls="sheet" aria-expanded="false">${icons.more}<span>More</span></button>
</nav>
<div id="touch-locked" class="touch-locked" hidden>
  <div>${icons.lock}<span>Touches locked<small id="unlock-hint">Hold the button for 1 second</small></span></div>
  <button id="unlock-view" aria-describedby="unlock-hint">Hold to unlock</button>
</div>
<div id="tool-bar" class="tool-bar" hidden>
  <p><strong id="tool-title"></strong><span id="tool-message"></span></p>
  <div class="tool-actions">
    <button id="route-undo" class="tool-undo" aria-label="Undo last point">${icons.undo}<span>Undo</span></button>
    <button id="tool-center" class="tool-primary">${icons.plus}<span id="tool-center-label">Place here</span></button>
    <button id="tool-done" class="tool-done">Done</button>
  </div>
</div>
<span id="placement-center" class="placement-center" aria-hidden="true" hidden></span>
<button id="sheet-dismiss" class="sheet-dismiss" aria-label="Close" tabindex="-1" hidden></button>
<section id="sheet" class="sheet" aria-labelledby="sheet-title" hidden>
  <div class="sheet-grabber" id="sheet-grabber"><span></span></div>
  <div class="sheet-header"><h2 id="sheet-title"></h2><button id="close-sheet" class="viewer-icon-button" aria-label="Close">${icons.close}</button></div>
  <div class="sheet-content">
    <div id="sheet-add" data-panel="add" data-title="Add to map" hidden>
      <div class="add-grid">
        <button id="add-marker" class="add-tile"><i class="tile-icon places">${icons.pin}</i><strong>Place</strong><small>Landmark, entrance, junction, note</small></button>
        <button id="add-route" class="add-tile"><i class="tile-icon routes">${icons.route}</i><strong>Route</strong><small>Tap along passages</small></button>
        <button id="add-checkpoint" class="add-tile"><i class="tile-icon checkpoints">${icons.checkpoint}</i><strong>Checkpoint</strong><small>A spot you recognize now</small></button>
        <button id="set-position" class="add-tile"><i class="tile-icon position">${icons.position}</i><strong>My position</strong><small>Manual estimate, no GPS</small></button>
      </div>
    </div>
    <div id="sheet-layers" data-panel="layers" data-title="Layers" hidden>
      <button id="spotlight" class="spotlight-button">${icons.sparkle}<span><strong>Highlight routes &amp; places</strong><small>Dims the map briefly so everything you saved stands out</small></span></button>
      <div class="layer-list">
        ${layerRow("layer-routes", "Routes", "routes")}
        ${layerRow("layer-places", "Places", "places")}
        ${layerRow("layer-checkpoints", "Checkpoints", "checkpoints")}
        ${layerRow("layer-position", "My position", "position")}
        ${layerRow("layer-labels", "Names", "labels")}
      </div>
    </div>
    <div id="sheet-saved" data-panel="saved" data-title="Saved" hidden>
      <div class="segmented" role="tablist" aria-label="Saved items">
        <button id="saved-routes" role="tab" aria-controls="saved-list-routes" data-saved="routes">Routes <span id="saved-routes-count"></span></button>
        <button id="saved-places" role="tab" aria-controls="saved-list-places" data-saved="places">Places <span id="saved-places-count"></span></button>
        <button id="saved-checkpoints" role="tab" aria-controls="saved-list-checkpoints" data-saved="checkpoints">Checks <span id="saved-checkpoints-count"></span></button>
      </div>
      <div id="saved-list-routes" role="tabpanel" aria-labelledby="saved-routes" class="navigation-list"><div id="route-list"></div></div>
      <div id="saved-list-places" role="tabpanel" aria-labelledby="saved-places" class="navigation-list" hidden><div id="position-row"></div><div id="marker-list"></div></div>
      <div id="saved-list-checkpoints" role="tabpanel" aria-labelledby="saved-checkpoints" class="navigation-list" hidden><p class="field-help">Lines join checkpoints in the order you confirmed them. They are not a path.</p><div id="checkpoint-list"></div></div>
    </div>
    <div id="sheet-more" data-panel="more" data-title="More" hidden>
      <section class="tool-section">
        <button id="fit" class="secondary wide with-icon">${icons.fit}<span>Show whole map</span></button>
        <label class="toggle-row"><span>Dark map<small id="dark-status" class="row-help"></small></span><input type="checkbox" role="switch" id="dark-map"></label>
        <label class="range-label" for="map-dimming"><span>${icons.sun}Map brightness</span><output id="dimming-value">100%</output></label><input id="map-dimming" class="wide" type="range" min="20" max="100" step="5">
      </section>
      <section class="tool-section"><h3>Rotation</h3>
        <label class="toggle-row"><span>Lock map rotation<small class="row-help">Unlock to twist with two fingers</small></span><input type="checkbox" role="switch" id="rotation-lock"></label>
        <div class="rotation-row"><button id="rotate-left" aria-label="Rotate map left 15 degrees">${icons.rotateLeft}</button><input id="rotation-angle" aria-label="Map rotation" type="range" min="0" max="359" step="1"><output id="rotation-value">0°</output><button id="rotate-right" aria-label="Rotate map right 15 degrees">${icons.rotateRight}</button></div>
        <button id="rotate-north" class="secondary wide with-icon">${icons.compass}<span>Reset to north up</span></button>
        <button id="device-orientation" class="secondary wide">Lock screen orientation</button><p id="orientation-message" class="field-help" role="status">If this is unavailable, use your phone’s rotation lock.</p>
      </section>
      <details class="tool-details"><summary>Pan buttons</summary><div class="pan-buttons" aria-label="Pan map"><button data-pan="left" aria-label="Pan left">${icons.arrow}</button><button data-pan="up" aria-label="Pan up"><span class="pan-up">${icons.arrow}</span></button><button data-pan="down" aria-label="Pan down"><span class="pan-down">${icons.arrow}</span></button><button data-pan="right" aria-label="Pan right"><span class="pan-right">${icons.arrow}</span></button></div></details>
      <details class="tool-details"><summary>Offline access</summary><p id="map-offline-status" class="field-help">Not checked yet.</p><button id="verify-current-map" class="secondary wide">Check this map offline</button></details>
      <p id="save-status" class="save-status" role="status">Saved on this device</p>
    </div>
  </div>
</section>
<p id="viewer-error" class="viewer-error" role="alert" hidden></p>
<dialog id="marker-dialog"><form id="marker-form"><h2 id="marker-dialog-title">New place</h2><div class="kind-chips" role="radiogroup" aria-label="Kind">${kindChips}</div><label>Name<input id="marker-label" required maxlength="100" autocomplete="off" enterkeyhint="done"></label><label>Notes <small>optional</small><textarea id="marker-note" maxlength="2000" rows="2"></textarea></label><div class="dialog-actions"><button type="button" id="marker-delete" class="danger" hidden>Delete</button><button type="button" id="marker-cancel" class="secondary">Cancel</button><button type="submit" class="primary">Save</button></div></form></dialog>
<dialog id="name-dialog"><form id="name-form"><h2 id="name-title"></h2><label>Name<input id="name-input" required maxlength="100" autocomplete="off" enterkeyhint="done"></label><div class="dialog-actions"><button type="button" id="name-cancel" class="secondary">Cancel</button><button type="submit" class="primary">Save</button></div></form></dialog>`;
