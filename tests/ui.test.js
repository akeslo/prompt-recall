import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildPopupDom } from './fixtures/dom-fixture.js';

// ui.js builds its `elements` singleton from the DOM at import time, so the
// fixture must be in place before the first (dynamic) import.
buildPopupDom();

const ui = await import('../popup/modules/ui.js');

describe('ui.isModalOpen', () => {
    afterEach(() => {
        for (const modal of [
            ui.elements.promptModal,
            ui.elements.settingsModal,
            ui.elements.variableModal,
            ui.elements.lockModal,
            ui.elements.pinSetupModal,
            ui.elements.welcomeModal
        ]) {
            modal.style.display = '';
        }
    });

    it('is false when every modal is closed', () => {
        expect(ui.isModalOpen()).toBe(false);
    });

    it.each([
        'promptModal',
        'settingsModal',
        'variableModal',
        'lockModal',
        'pinSetupModal',
        'welcomeModal'
    ])('is true when %s is displayed as flex', (key) => {
        ui.elements[key].style.display = 'flex';
        expect(ui.isModalOpen()).toBe(true);
    });

    it('is false when a modal is display:block instead of flex', () => {
        ui.elements.promptModal.style.display = 'block';
        expect(ui.isModalOpen()).toBe(false);
    });
});

describe('ui.formatRelativeTime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns "just now" for timestamps under 10 seconds old', () => {
        const ts = Date.now() - 5000;
        expect(ui.formatRelativeTime(ts)).toBe('just now');
    });

    it('formats seconds ago', () => {
        const ts = Date.now() - 30000;
        expect(ui.formatRelativeTime(ts)).toBe('30s ago');
    });

    it('formats minutes ago', () => {
        const ts = Date.now() - 5 * 60000;
        expect(ui.formatRelativeTime(ts)).toBe('5m ago');
    });

    it('formats hours ago', () => {
        const ts = Date.now() - 3 * 3600000;
        expect(ui.formatRelativeTime(ts)).toBe('3h ago');
    });

    it('formats days ago', () => {
        const ts = Date.now() - 2 * 86400000;
        expect(ui.formatRelativeTime(ts)).toBe('2d ago');
    });
});

describe('ui.formatBytes', () => {
    it('formats zero bytes', () => {
        expect(ui.formatBytes(0)).toBe('0 Bytes');
    });

    it('formats bytes under 1 KB', () => {
        expect(ui.formatBytes(512)).toBe('512 Bytes');
    });

    it('formats kilobytes', () => {
        expect(ui.formatBytes(2048)).toBe('2 KB');
    });

    it('formats megabytes', () => {
        expect(ui.formatBytes(1024 * 1024 * 3)).toBe('3 MB');
    });

    it('rounds to 2 decimal places', () => {
        expect(ui.formatBytes(1500)).toBe('1.46 KB');
    });
});

describe('ui.renderStorageInfo', () => {
    it('does nothing when info is falsy', () => {
        ui.elements.storageInfo.innerHTML = 'unchanged';
        ui.renderStorageInfo(null, '1.2.3');
        expect(ui.elements.storageInfo.innerHTML).toBe('unchanged');
    });

    it('renders usage/quota/percentage and version', () => {
        ui.renderStorageInfo({ usage: 1024, quota: 102400, percentage: 1 }, '1.2.3');
        const html = ui.elements.storageInfo.innerHTML;
        expect(html).toContain('1 KB');
        expect(html).toContain('100 KB');
        expect(html).toContain('1%');
        expect(html).toContain('v1.2.3');
        expect(html).not.toContain('storage-warning');
    });

    it('adds the warning class when usage percentage exceeds 80', () => {
        ui.renderStorageInfo({ usage: 90000, quota: 102400, percentage: 88 }, '1.2.3');
        expect(ui.elements.storageInfo.innerHTML).toContain('storage-warning');
    });
});

describe('ui.showNotification', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.querySelectorAll('.notification').forEach((n) => n.remove());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('appends a notification div with the message and default type', () => {
        ui.showNotification('Saved successfully');
        const node = document.body.querySelector('.notification');
        expect(node).not.toBeNull();
        expect(node.textContent).toBe('Saved successfully');
        expect(node.className).toBe('notification success');
    });

    it('applies a custom type class', () => {
        ui.showNotification('Something broke', 'error');
        const node = document.body.querySelector('.notification');
        expect(node.className).toBe('notification error');
    });

    it('removes itself after 3 seconds', () => {
        ui.showNotification('Bye');
        expect(document.body.querySelector('.notification')).not.toBeNull();

        vi.advanceTimersByTime(3000);

        expect(document.body.querySelector('.notification')).toBeNull();
    });
});
