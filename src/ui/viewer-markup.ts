import { icons } from "./icons";

// Keep field actions on one toolbar. Secondary controls live in a small tools sheet.
export const viewerMarkup = `
<div class="map-stage"><canvas id="map-canvas" tabindex="0" aria-label="Map: drag to pan; pinch or scroll to zoom. Arrows pan, plus and minus zoom, F fits."></canvas><svg id="map-overlay" class="map-overlay" aria-hidden="true"></svg></div>
<header class="viewer-top">
  <button class="viewer-icon-button" id="back" aria-label="Return to library">${icons.arrow}</button>
  <span id="viewer-title"></span><output id="zoom" aria-label="Current zoom">100%</output>
</header>
<nav class="viewer-controls" aria-label="Map actions">
  <button id="fit" aria-label="Fit map to screen">${icons.fit}<span>Fit</span></button>
  <button id="quick-invert" aria-label="Invert map colors" aria-pressed="false">${icons.invert}<span>Invert</span></button>
  <button id="touch-lock" aria-label="Lock map touches" aria-pressed="false">${icons.lock}<span>Lock</span></button>
  <button id="toggle-panel" aria-label="Open map tools" aria-controls="map-panel" aria-expanded="false">${icons.tools}<span>Tools</span></button>
</nav>
<div id="touch-locked" class="touch-locked" hidden>
  <div>${icons.lock}<span>View locked<small id="unlock-hint">Hold to unlock · 1 second</small></span></div>
  <button id="unlock-view" aria-describedby="unlock-hint">Unlock</button>
</div>
<div id="tool-hint" class="tool-hint" hidden>
  <p id="tool-message"></p><div><button id="tool-center">Place at center</button><button id="route-undo" hidden>Undo</button><button id="route-finish" hidden>Finish route</button><button id="tool-cancel">Done</button></div>
</div>
<span id="placement-center" class="placement-center" aria-hidden="true" hidden></span>
<button id="sheet-dismiss" class="sheet-dismiss" aria-label="Dismiss map tools" tabindex="-1" hidden></button>
<aside id="map-panel" class="map-panel" aria-labelledby="tools-title" hidden>
  <div class="panel-heading"><h2 id="tools-title">Map tools</h2><button id="close-panel" class="viewer-icon-button" aria-label="Close map tools">${icons.close}</button></div>
  <div class="tools-tabs" role="tablist" aria-label="Map tools categories">
    <button id="tools-display" role="tab" aria-controls="tab-display" aria-selected="true" data-tools-tab="display">Display</button>
    <button id="tools-places" role="tab" aria-controls="tab-places" aria-selected="false" tabindex="-1" data-tools-tab="places">Places</button>
    <button id="tools-routes" role="tab" aria-controls="tab-routes" aria-selected="false" tabindex="-1" data-tools-tab="routes">Routes</button>
  </div>
  <div class="sheet-content">
    <div id="tab-display" role="tabpanel" aria-labelledby="tools-display">
      <section class="tool-section">
        <div class="zoom-buttons"><button id="zoom-out" class="secondary">${icons.minus}<span>Zoom out</span></button><button id="zoom-in" class="secondary">${icons.plus}<span>Zoom in</span></button></div>
        <label class="toggle-row"><span>Invert map colors</span><input type="checkbox" role="switch" id="invert-colors"></label>
        <label class="range-label" for="map-dimming">Map brightness <output id="dimming-value">100%</output></label><input id="map-dimming" class="wide" type="range" min="20" max="100" step="5">
      </section>
      <section class="tool-section"><h3>Orientation</h3>
        <label class="toggle-row"><span>Lock map rotation</span><input type="checkbox" role="switch" id="rotation-lock"></label>
        <details class="tool-details"><summary>Map angle <output id="rotation-value">0°</output></summary><div class="rotation-row"><button id="rotate-left" aria-label="Rotate map left 15 degrees">${icons.rotateLeft}</button><input id="rotation-angle" aria-label="Map rotation" type="range" min="0" max="359" step="1"><button id="rotate-right" aria-label="Rotate map right 15 degrees">${icons.rotateRight}</button></div></details>
        <button id="device-orientation" class="secondary wide">Lock device orientation</button><p id="orientation-message" class="field-help" role="status">Use your phone’s rotation lock if device locking is unavailable.</p>
      </section>
      <details class="tool-details"><summary>Pan controls</summary><div class="pan-buttons" aria-label="Pan map"><button data-pan="left" aria-label="Pan left">${icons.arrow}</button><button data-pan="up" aria-label="Pan up"><span class="pan-up">${icons.arrow}</span></button><button data-pan="down" aria-label="Pan down"><span class="pan-down">${icons.arrow}</span></button><button data-pan="right" aria-label="Pan right"><span class="pan-right">${icons.arrow}</span></button></div></details>
      <details class="tool-details"><summary>Offline access</summary><p id="map-offline-status" class="field-help">Not checked yet.</p><button id="verify-current-map" class="secondary wide">Check this map offline</button></details>
    </div>
    <div id="tab-places" role="tabpanel" aria-labelledby="tools-places" hidden>
      <section class="tool-section"><div class="panel-section-heading"><h3>Bookmarks & notes</h3><button id="add-marker" class="text-button">Add place</button></div><div id="marker-list" class="navigation-list"></div></section>
      <section class="tool-section"><h3>Estimated position</h3><p class="field-help">Manually placed. No GPS tracking.</p><p id="position-status" class="field-help">No estimated position set.</p><div class="panel-actions"><button id="set-position" class="secondary">Place on map</button><button id="jump-position" class="secondary">Go to estimate</button><button id="clear-position" class="text-button">Clear</button></div></section>
    </div>
    <div id="tab-routes" role="tabpanel" aria-labelledby="tools-routes" hidden>
      <section class="tool-section"><div class="panel-section-heading"><h3>Planned routes</h3><button id="add-route" class="text-button">Plan route</button></div><p class="field-help">Draw your route by tapping along passages.</p><div id="route-list" class="navigation-list"></div></section>
      <section class="tool-section"><div class="panel-section-heading"><h3>Confirmed checkpoints</h3><button id="add-checkpoint" class="text-button">Confirm</button></div><p class="field-help">Mark a place you recognize. Connecting lines show the order of your checkpoints, not a navigable path.</p><div id="checkpoint-list" class="navigation-list"></div></section>
    </div>
  </div>
  <p id="save-status" class="save-status" role="status">Saved on device</p>
</aside>
<p id="viewer-error" class="viewer-error" role="alert" hidden></p>
<dialog id="marker-dialog"><form id="marker-form"><h2 id="marker-dialog-title">Add bookmark</h2><label>Name<input id="marker-label" required maxlength="100" autocomplete="off"></label><label>Kind<select id="marker-kind"><option value="bookmark">Bookmark</option><option value="entrance">Entrance</option><option value="junction">Junction</option><option value="landmark">Landmark</option><option value="note">Note</option></select></label><label>Notes<textarea id="marker-note" maxlength="2000" rows="3"></textarea></label><div class="dialog-actions"><button type="button" id="marker-delete" class="danger" hidden>Delete</button><button type="button" id="marker-cancel" class="secondary">Cancel</button><button type="submit" class="primary">Save</button></div></form></dialog>
<dialog id="name-dialog"><form id="name-form"><h2 id="name-title"></h2><label>Name<input id="name-input" required maxlength="100" autocomplete="off"></label><div class="dialog-actions"><button type="button" id="name-cancel" class="secondary">Cancel</button><button type="submit" class="primary">Save</button></div></form></dialog>`;
