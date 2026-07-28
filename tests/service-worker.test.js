import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocked in place of the real lib/storage.js — service-worker.js only needs
// savePrompt/exportPrompts, and we want to assert on how it calls them
// without dragging in chrome.storage callback plumbing from storage.js.
vi.mock('/lib/storage.js', () => ({
    savePrompt: vi.fn(),
    exportPrompts: vi.fn()
}));

import { savePrompt, exportPrompts } from '/lib/storage.js';

// Listener registries — populated as service-worker.js registers them at
// import time (it's a plain script with top-level side effects, not an
// ES module with exports), so tests drive behavior by invoking the
// captured callbacks directly.
const listeners = {
    onInstalled: [],
    onStartup: [],
    onContextMenuClicked: [],
    onMessage: [],
    onStorageChanged: [],
    onCommand: [],
    onAlarm: []
};

function flushMicrotasks() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

global.chrome = {
    runtime: {
        onInstalled: { addListener: vi.fn(fn => listeners.onInstalled.push(fn)) },
        onStartup: { addListener: vi.fn(fn => listeners.onStartup.push(fn)) },
        onMessage: { addListener: vi.fn(fn => listeners.onMessage.push(fn)) },
        lastError: null
    },
    contextMenus: {
        create: vi.fn(),
        onClicked: { addListener: vi.fn(fn => listeners.onContextMenuClicked.push(fn)) }
    },
    notifications: {
        create: vi.fn()
    },
    storage: {
        local: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => undefined)
        },
        sync: {
            getBytesInUse: vi.fn(async () => 0),
            QUOTA_BYTES: 102400
        },
        onChanged: { addListener: vi.fn(fn => listeners.onStorageChanged.push(fn)) }
    },
    commands: {
        onCommand: { addListener: vi.fn(fn => listeners.onCommand.push(fn)) }
    },
    tabs: {
        query: vi.fn(),
        sendMessage: vi.fn()
    },
    alarms: {
        clear: vi.fn(async () => true),
        create: vi.fn(),
        onAlarm: { addListener: vi.fn(fn => listeners.onAlarm.push(fn)) }
    },
    downloads: {
        create: vi.fn(async () => 1)
    }
};

// service-worker.js registers all its listeners as an import-time side
// effect, so importing it once (module cache handles repeat imports) is
// enough to populate the `listeners` registries above.
await import('../background/service-worker.js');

beforeEach(() => {
    vi.clearAllMocks();
    global.chrome.runtime.lastError = null;
});

describe('onInstalled', () => {
    it('creates the "Save as AI Prompt" context menu', () => {
        listeners.onInstalled[0]();

        expect(chrome.contextMenus.create).toHaveBeenCalledWith({
            id: 'saveAsPrompt',
            title: 'Save as AI Prompt',
            contexts: ['selection']
        });
    });

    it('re-registers the auto-backup alarm when enabled', async () => {
        chrome.storage.local.get.mockResolvedValueOnce({
            autoBackupEnabled: true,
            autoBackupInterval: 120
        });

        listeners.onInstalled[0]();
        await flushMicrotasks();

        expect(chrome.alarms.clear).toHaveBeenCalledWith('autoBackup');
        expect(chrome.alarms.create).toHaveBeenCalledWith('autoBackup', { periodInMinutes: 120 });
    });

    it('defaults the backup interval to 360 minutes when unset', async () => {
        chrome.storage.local.get.mockResolvedValueOnce({ autoBackupEnabled: true });

        listeners.onInstalled[0]();
        await flushMicrotasks();

        expect(chrome.alarms.create).toHaveBeenCalledWith('autoBackup', { periodInMinutes: 360 });
    });

    it('does not touch alarms when auto-backup is disabled', async () => {
        chrome.storage.local.get.mockResolvedValueOnce({ autoBackupEnabled: false });

        listeners.onInstalled[0]();
        await flushMicrotasks();

        expect(chrome.alarms.clear).not.toHaveBeenCalled();
        expect(chrome.alarms.create).not.toHaveBeenCalled();
    });
});

describe('onStartup', () => {
    it('also re-registers the auto-backup alarm', async () => {
        chrome.storage.local.get.mockResolvedValueOnce({
            autoBackupEnabled: true,
            autoBackupInterval: 90
        });

        listeners.onStartup[0]();
        await flushMicrotasks();

        expect(chrome.alarms.create).toHaveBeenCalledWith('autoBackup', { periodInMinutes: 90 });
    });
});

describe('context menu click (save selection)', () => {
    it('saves the selected text as a prompt and notifies success', async () => {
        savePrompt.mockResolvedValueOnce({ id: 'p1', title: 'Some text', content: 'Some text' });

        listeners.onContextMenuClicked[0]({ menuItemId: 'saveAsPrompt', selectionText: 'Some text' }, {});
        await flushMicrotasks();

        expect(savePrompt).toHaveBeenCalledWith('Some text', 'Some text', []);
        expect(chrome.notifications.create).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'AI Prompt Saved' })
        );
    });

    it('truncates long selections to 50 chars (+ ellipsis) for the title', async () => {
        const longText = 'x'.repeat(80);
        savePrompt.mockResolvedValueOnce({ id: 'p2', title: 'irrelevant', content: longText });

        listeners.onContextMenuClicked[0]({ menuItemId: 'saveAsPrompt', selectionText: longText }, {});
        await flushMicrotasks();

        expect(savePrompt).toHaveBeenCalledWith(longText.slice(0, 50) + '...', longText, []);
    });

    it('ignores empty or whitespace-only selections', async () => {
        listeners.onContextMenuClicked[0]({ menuItemId: 'saveAsPrompt', selectionText: '   ' }, {});
        await flushMicrotasks();

        expect(savePrompt).not.toHaveBeenCalled();
    });

    it('ignores clicks on other menu items', async () => {
        listeners.onContextMenuClicked[0]({ menuItemId: 'somethingElse', selectionText: 'hi' }, {});
        await flushMicrotasks();

        expect(savePrompt).not.toHaveBeenCalled();
    });

    it('shows an error notification when saving fails', async () => {
        savePrompt.mockRejectedValueOnce(new Error('storage exploded'));

        listeners.onContextMenuClicked[0]({ menuItemId: 'saveAsPrompt', selectionText: 'hi' }, {});
        await flushMicrotasks();

        expect(chrome.notifications.create).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Error' })
        );
    });
});

describe('onMessage', () => {
    it('handles "promptSaved" without keeping the channel open', () => {
        const sendResponse = vi.fn();
        const result = listeners.onMessage[0]({ action: 'promptSaved', prompt: {} }, {}, sendResponse);

        expect(result).toBe(false);
        expect(sendResponse).not.toHaveBeenCalled();
    });

    it('keeps the channel open for "fetchImageUrl" and resolves a data URL on success', async () => {
        global.fetch = vi.fn(async () => ({
            ok: true,
            headers: { get: () => 'image/png' },
            blob: async () => new Blob(['fake-bytes'], { type: 'image/png' })
        }));

        const sendResponse = vi.fn();
        const result = listeners.onMessage[0](
            { action: 'fetchImageUrl', url: 'https://example.com/pic.png' },
            {},
            sendResponse
        );

        expect(result).toBe(true); // async response channel kept open
        await flushMicrotasks();
        await flushMicrotasks();

        expect(sendResponse).toHaveBeenCalledWith(
            expect.objectContaining({ ok: true, dataUrl: expect.stringContaining('data:') })
        );
    });

    it('reports a non-ok HTTP response as an error', async () => {
        global.fetch = vi.fn(async () => ({
            ok: false,
            status: 404,
            headers: { get: () => 'text/html' }
        }));

        const sendResponse = vi.fn();
        listeners.onMessage[0](
            { action: 'fetchImageUrl', url: 'https://example.com/missing.png' },
            {},
            sendResponse
        );
        await flushMicrotasks();
        await flushMicrotasks();

        expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'HTTP 404' });
    });

    it('reports a non-image content-type as an error', async () => {
        global.fetch = vi.fn(async () => ({
            ok: true,
            headers: { get: () => 'text/html' }
        }));

        const sendResponse = vi.fn();
        listeners.onMessage[0](
            { action: 'fetchImageUrl', url: 'https://example.com/notanimage' },
            {},
            sendResponse
        );
        await flushMicrotasks();
        await flushMicrotasks();

        expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'URL is not an image' });
    });

    it('surfaces a fetch rejection as an error response', async () => {
        global.fetch = vi.fn(async () => {
            throw new Error('network down');
        });

        const sendResponse = vi.fn();
        listeners.onMessage[0](
            { action: 'fetchImageUrl', url: 'https://example.com/pic.png' },
            {},
            sendResponse
        );
        await flushMicrotasks();
        await flushMicrotasks();

        expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'network down' });
    });

    it('keeps the channel open for unrecognized actions', () => {
        const sendResponse = vi.fn();
        const result = listeners.onMessage[0]({ action: 'somethingUnknown' }, {}, sendResponse);
        expect(result).toBe(true);
    });
});

describe('storage.onChanged (quota monitoring)', () => {
    it('checks quota when prompts change in sync storage', async () => {
        chrome.storage.sync.getBytesInUse.mockResolvedValueOnce(50000);

        listeners.onStorageChanged[0]({ prompts: {} }, 'sync');
        await flushMicrotasks();

        expect(chrome.storage.sync.getBytesInUse).toHaveBeenCalled();
    });

    it('checks quota when prompts_meta changes in sync storage', async () => {
        chrome.storage.sync.getBytesInUse.mockResolvedValueOnce(50000);

        listeners.onStorageChanged[0]({ prompts_meta: {} }, 'sync');
        await flushMicrotasks();

        expect(chrome.storage.sync.getBytesInUse).toHaveBeenCalled();
    });

    it('ignores unrelated keys', async () => {
        listeners.onStorageChanged[0]({ someOtherKey: {} }, 'sync');
        await flushMicrotasks();

        expect(chrome.storage.sync.getBytesInUse).not.toHaveBeenCalled();
    });

    it('ignores changes in the local area', async () => {
        listeners.onStorageChanged[0]({ prompts: {} }, 'local');
        await flushMicrotasks();

        expect(chrome.storage.sync.getBytesInUse).not.toHaveBeenCalled();
    });

    it('warns when usage exceeds 90% of quota', async () => {
        chrome.storage.sync.getBytesInUse.mockResolvedValueOnce(95000); // ~92.8% of 102400

        listeners.onStorageChanged[0]({ prompts: {} }, 'sync');
        await flushMicrotasks();

        expect(chrome.notifications.create).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Storage Almost Full' })
        );
    });

    it('does not warn when usage is comfortably under quota', async () => {
        chrome.storage.sync.getBytesInUse.mockResolvedValueOnce(1000);

        listeners.onStorageChanged[0]({ prompts: {} }, 'sync');
        await flushMicrotasks();

        expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('swallows errors from a failing storage API without throwing', async () => {
        chrome.storage.sync.getBytesInUse.mockRejectedValueOnce(new Error('quota API down'));

        expect(() => listeners.onStorageChanged[0]({ prompts: {} }, 'sync')).not.toThrow();
        await flushMicrotasks();
    });
});

describe('alarms.onAlarm (auto-backup)', () => {
    it('ignores alarms other than autoBackup', async () => {
        listeners.onAlarm[0]({ name: 'somethingElse' });
        await flushMicrotasks();

        expect(exportPrompts).not.toHaveBeenCalled();
    });

    it('skips the backup entirely when auto-backup is disabled', async () => {
        chrome.storage.local.get.mockResolvedValueOnce({ autoBackupEnabled: false });

        listeners.onAlarm[0]({ name: 'autoBackup' });
        await flushMicrotasks();

        expect(exportPrompts).not.toHaveBeenCalled();
        expect(chrome.downloads.create).not.toHaveBeenCalled();
    });

    it('exports prompts and downloads a backup file when enabled', async () => {
        chrome.storage.local.get.mockResolvedValueOnce({ autoBackupEnabled: true });
        exportPrompts.mockResolvedValueOnce('[{"id":"p1"}]');

        listeners.onAlarm[0]({ name: 'autoBackup' });
        await flushMicrotasks();
        await flushMicrotasks();

        expect(exportPrompts).toHaveBeenCalled();
        expect(chrome.downloads.create).toHaveBeenCalledWith(
            expect.objectContaining({
                filename: expect.stringMatching(/^prompt-recall-backup-\d{4}-\d{2}-\d{2}\.json$/),
                saveAs: false,
                url: expect.stringContaining('data:application/json;base64,')
            })
        );
        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({ autoBackupLastTs: expect.any(Number) })
        );
    });

    it('does not throw and skips the timestamp write when export fails', async () => {
        chrome.storage.local.get.mockResolvedValueOnce({ autoBackupEnabled: true });
        exportPrompts.mockRejectedValueOnce(new Error('export failed'));

        listeners.onAlarm[0]({ name: 'autoBackup' });
        await flushMicrotasks();
        await flushMicrotasks();

        expect(chrome.downloads.create).not.toHaveBeenCalled();
        expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
});
