/**
 * Minimal popup DOM fixture.
 *
 * popup/modules/ui.js builds a module-level `elements` singleton by calling
 * `document.getElementById(...)` once, at import time, for every id below.
 * Any id it doesn't find just becomes `null` in that object — harmless until
 * something dereferences it — so this fixture only needs to give *real*
 * structure to the ids that the functions under test actually touch
 * (searchInput, sortSelect, promptsList, emptyState, variableModal,
 * variableInputs). Everything else is stubbed as a plain <div>/<input> so a
 * future test extending coverage doesn't immediately hit a null-deref.
 *
 * IMPORTANT: because `ui.js`/`app.js` read the DOM at import time, this must
 * be applied to `document.body.innerHTML` *before* those modules are
 * imported (dynamic `import()` after the fixture is set, not a static
 * top-of-file `import`).
 *
 * `resizeHandle` is included for popup.js's drag-to-resize wiring
 * (popup/popup.js:14-49) — it's the only extra id that module reads beyond
 * `.container`, which the fixture already has.
 */
export function buildPopupDom() {
    document.body.innerHTML = `
    <div class="container">
      <div id="resizeHandle"></div>
      <input id="searchInput" type="text" />
      <select id="sortSelect">
        <option value="recent">Most Recent</option>
        <option value="lastUsed">Last Used</option>
        <option value="alphabetical">A-Z</option>
        <option value="mostUsed">Most Used</option>
        <option value="byTag">By Tag</option>
        <option value="favorites">Favorites Only</option>
      </select>
      <div id="tagFilterStrip"></div>
      <button id="addPromptBtn"></button>
      <div id="promptsList"></div>
      <div id="emptyState"></div>
      <div id="storageInfo"></div>

      <div id="promptModal">
        <div id="modalTitle"></div>
        <input id="promptTitle" type="text" />
        <textarea id="promptContent"></textarea>
        <input id="promptTags" type="text" />
        <button id="savePromptBtn"></button>
        <button id="cancelBtn"></button>
        <button id="closeModal"></button>
        <input id="promptLockToggle" type="checkbox" />
        <div id="lockPinHint"></div>
      </div>

      <div id="tagSelected"></div>
      <div id="tagSuggestions"></div>

      <div id="variantsList"></div>
      <button id="addVariantBtn"></button>

      <div id="beforeSlot">
        <div class="media-slot-placeholder"></div>
        <img class="media-slot-preview" />
        <button class="media-slot-remove"></button>
        <input class="media-file-input" type="file" />
      </div>
      <div id="afterSlot">
        <div class="media-slot-placeholder"></div>
        <img class="media-slot-preview" />
        <button class="media-slot-remove"></button>
        <input class="media-file-input" type="file" />
      </div>

      <div id="settingsModal">
        <button id="closeSettingsModal"></button>
        <button id="exportBtn"></button>
        <button id="importBtn"></button>
        <input id="importFile" type="file" />
        <button id="clearAllBtn"></button>
        <button id="loadSamplesBtn"></button>
      </div>
      <button id="settingsBtn"></button>

      <div id="variableModal">
        <div id="variableInputs"></div>
        <button id="confirmVariableBtn"></button>
        <button id="cancelVariableBtn"></button>
        <button id="closeVariableModal"></button>
      </div>

      <div id="lockModal">
        <input id="lockPinInput" type="text" />
        <div id="lockPinError"></div>
        <button id="confirmLockBtn"></button>
        <button id="cancelLockBtn"></button>
        <button id="closeLockModal"></button>
      </div>

      <div id="pinSetupModal">
        <div id="pinSetupTitle"></div>
        <div id="pinCurrentGroup"></div>
        <input id="pinCurrentInput" type="text" />
        <input id="pinNewInput" type="text" />
        <input id="pinConfirmInput" type="text" />
        <div id="pinSetupError"></div>
        <button id="confirmPinSetupBtn"></button>
        <button id="cancelPinSetupBtn"></button>
        <button id="closePinSetupModal"></button>
      </div>

      <div id="pinStatusText"></div>
      <button id="managePinBtn"></button>
      <button id="clearPinBtn"></button>

      <button id="sortDirBtn"><svg><path id="sortDirIcon"/></svg></button>

      <div id="themeSwatches"></div>
      <input id="themeCustomInput" type="color" />
      <div id="themeCustomSwatch"></div>
      <div id="fontSizeBtns"></div>

      <input id="autoBackupToggle" type="checkbox" />
      <input id="autoBackupInterval" type="number" />
      <div id="autoBackupOptions"></div>
      <div id="autoBackupLastTs"></div>

      <div id="welcomeModal">
        <button id="skipSamplesBtn"></button>
        <button id="loadSamplesWelcomeBtn"></button>
      </div>
    </div>
  `;
}
