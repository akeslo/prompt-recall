import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPopupDom } from './fixtures/dom-fixture.js';

// popup.js's only real dependency is app.js's `init`. Mocking it here keeps
// this file scoped to popup.js's own job — module init/DOM setup, event
// wiring, and error handling during setup — rather than re-exercising
// app.js's full init() sequence (already covered by app.test.js indirectly
// and by the modules it calls into).
const initMock = vi.fn();
vi.mock('/popup/modules/app.js', () => ({ init: initMock }));

// Mock chrome global — popup.js only touches storage.local.
global.chrome = {
    storage: {
        local: {
            get: vi.fn((_keys, cb) => cb({})),
            set: vi.fn()
        }
    }
};

const MIN_HEIGHT = 400;
const MAX_HEIGHT = 800;

// `document` is shared across tests within this file (jsdom doesn't reset
// it per-test), so re-importing popup.js on every test would keep stacking
// new 'DOMContentLoaded' listeners onto the same document — the first
// symptom being init() reported as called N times instead of once. Capture
// the registered callback directly via a spy and invoke *that*, instead of
// dispatching a real event that every accumulated listener would also hear.
let domContentLoadedHandler = null;

async function loadPopup() {
    vi.resetModules();
    const addSpy = vi.spyOn(document, 'addEventListener');
    await import('../popup/popup.js');
    const registered = addSpy.mock.calls.find(([evt]) => evt === 'DOMContentLoaded');
    addSpy.mockRestore();
    domContentLoadedHandler = registered ? registered[1] : null;
}

function fireDomContentLoaded() {
    expect(domContentLoadedHandler).toBeTypeOf('function');
    domContentLoadedHandler();
}

beforeEach(() => {
    vi.clearAllMocks();
    domContentLoadedHandler = null;
    buildPopupDom();
    // documentElement itself isn't rebuilt by buildPopupDom() (only
    // document.body is), so a --popup-height set by one test would
    // otherwise leak into the next.
    document.documentElement.style.removeProperty('--popup-height');
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({}));
});

describe('module initialization / DOM setup', () => {
    it('does not call init() or touch the DOM merely on import', async () => {
        await loadPopup();
        expect(initMock).not.toHaveBeenCalled();
    });

    it('calls init() once DOMContentLoaded fires', async () => {
        await loadPopup();
        fireDomContentLoaded();
        expect(initMock).toHaveBeenCalledTimes(1);
    });

    it('restores a previously saved popup height on DOMContentLoaded', async () => {
        chrome.storage.local.get.mockImplementation((_keys, cb) => cb({ popupHeight: 555 }));

        await loadPopup();
        fireDomContentLoaded();

        expect(document.documentElement.style.getPropertyValue('--popup-height')).toBe('555px');
    });

    it('leaves the height custom property unset when nothing was saved', async () => {
        await loadPopup();
        fireDomContentLoaded();

        expect(document.documentElement.style.getPropertyValue('--popup-height')).toBe('');
    });
});

describe('event listener wiring', () => {
    it('wires a mousedown listener on the resize handle that starts a drag', async () => {
        await loadPopup();
        fireDomContentLoaded();

        const handle = document.getElementById('resizeHandle');
        handle.dispatchEvent(new MouseEvent('mousedown', { clientY: 100, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 150, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { clientY: 150, bubbles: true }));

        // A drag only produces a save if mousedown actually registered the
        // move/up listeners — this is the wiring under test.
        expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    it('grows the popup height as the pointer drags down, clamped to MAX_HEIGHT', async () => {
        await loadPopup();
        fireDomContentLoaded();

        const handle = document.getElementById('resizeHandle');
        const container = document.querySelector('.container');
        Object.defineProperty(container, 'offsetHeight', { value: 500, configurable: true });

        handle.dispatchEvent(new MouseEvent('mousedown', { clientY: 0, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 1000, bubbles: true }));

        expect(document.documentElement.style.getPropertyValue('--popup-height')).toBe(`${MAX_HEIGHT}px`);
    });

    it('shrinks the popup height as the pointer drags up, clamped to MIN_HEIGHT', async () => {
        await loadPopup();
        fireDomContentLoaded();

        const handle = document.getElementById('resizeHandle');
        const container = document.querySelector('.container');
        Object.defineProperty(container, 'offsetHeight', { value: 500, configurable: true });

        handle.dispatchEvent(new MouseEvent('mousedown', { clientY: 0, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: -1000, bubbles: true }));

        expect(document.documentElement.style.getPropertyValue('--popup-height')).toBe(`${MIN_HEIGHT}px`);
    });

    it('persists the final height to chrome.storage.local on mouseup', async () => {
        await loadPopup();
        fireDomContentLoaded();

        const handle = document.getElementById('resizeHandle');
        const container = document.querySelector('.container');
        Object.defineProperty(container, 'offsetHeight', { value: 500, configurable: true });

        handle.dispatchEvent(new MouseEvent('mousedown', { clientY: 0, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 50, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { clientY: 50, bubbles: true }));

        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            { popupHeight: 550 },
            expect.any(Function)
        );
    });

    it('stops tracking the pointer after mouseup (removes move/up listeners)', async () => {
        await loadPopup();
        fireDomContentLoaded();

        const handle = document.getElementById('resizeHandle');
        const container = document.querySelector('.container');
        Object.defineProperty(container, 'offsetHeight', { value: 500, configurable: true });

        handle.dispatchEvent(new MouseEvent('mousedown', { clientY: 0, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 50, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { clientY: 50, bubbles: true }));

        chrome.storage.local.set.mockClear();
        // Further movement after mouseup should not update height or re-save.
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 700, bubbles: true }));

        expect(document.documentElement.style.getPropertyValue('--popup-height')).toBe('550px');
        expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
});

describe('error handling during setup', () => {
    it('does not throw and skips resize wiring when #resizeHandle is missing from the DOM', async () => {
        document.getElementById('resizeHandle').remove();

        await loadPopup();
        expect(() => fireDomContentLoaded()).not.toThrow();
        expect(initMock).toHaveBeenCalledTimes(1);
    });

    it('still calls init() even when the resize handle is missing', async () => {
        document.getElementById('resizeHandle').remove();

        await loadPopup();
        fireDomContentLoaded();

        expect(initMock).toHaveBeenCalledTimes(1);
    });
});
