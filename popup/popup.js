/**
 * Popup Entry Point
 */
import { init } from '/popup/modules/app.js';

const MIN_HEIGHT = 400;
const MAX_HEIGHT = 800;
const STORAGE_KEY = 'popupHeight';

function applyHeight(h) {
  document.documentElement.style.setProperty('--popup-height', h + 'px');
}

function initResize() {
  const handle = document.getElementById('resizeHandle');
  if (!handle) return;

  // Restore saved height
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    if (chrome.runtime?.lastError) console.error('initResize load:', chrome.runtime?.lastError);
    const saved = result[STORAGE_KEY];
    if (saved) applyHeight(saved);
  });

  let startY = 0;
  let startHeight = 0;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startHeight = document.querySelector('.container').offsetHeight;

    const onMove = (e) => {
      const delta = e.clientY - startY;
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + delta));
      applyHeight(newH);
    };

    const onUp = (e) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const finalH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT,
        startHeight + (e.clientY - startY)));
      chrome.storage.local.set({ [STORAGE_KEY]: finalH }, () => {
        if (chrome.runtime?.lastError) console.error('initResize save:', chrome.runtime?.lastError);
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  initResize();
});
