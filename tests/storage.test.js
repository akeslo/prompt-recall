import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome global
global.chrome = {
    runtime: { lastError: null },
    storage: {
        sync: {
            get: vi.fn(),
            set: vi.fn(),
            remove: vi.fn(),
            QUOTA_BYTES: 102400,
            getBytesInUse: vi.fn()
        },
        local: {
            get: vi.fn(),
            set: vi.fn(),
            remove: vi.fn(),
            clear: vi.fn(),
            getBytesInUse: vi.fn()
        },
        onChanged: { addListener: vi.fn() }
    }
};

// Import module under test
import {
    getAllPrompts,
    savePrompt,
    deletePrompt,
    importPrompts
} from '../lib/storage.js';

describe('Storage Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.chrome.runtime.lastError = null;
    });

    it('should save a new prompt (Hybrid)', async () => {
        // Mock get meta to return empty
        global.chrome.storage.sync.get.mockImplementation((key, callback) => {
            // storage logic requests 'prompts_meta'
            callback({ prompts_meta: [] });
        });

        // Mock sync set to succeed
        global.chrome.storage.sync.set.mockImplementation((data, callback) => {
            callback();
        });

        // Mock local set to succeed
        global.chrome.storage.local.set.mockImplementation((data, callback) => {
            callback();
        });

        const prompt = await savePrompt('Test Title', 'Test Content', ['tag1']);

        expect(prompt).toBeDefined();
        expect(prompt.title).toBe('Test Title');
        expect(prompt.content).toBe('Test Content');

        // Verify Meta saved to Sync
        expect(global.chrome.storage.sync.set).toHaveBeenCalledTimes(1);
        const metaCalls = global.chrome.storage.sync.set.mock.calls[0][0];
        expect(metaCalls.prompts_meta).toBeDefined();
        expect(metaCalls.prompts_meta[0].title).toBe('Test Title');
        expect(metaCalls.prompts_meta[0].content).toBeUndefined(); // Meta shouldn't have content

        // Verify Content saved to Local
        expect(global.chrome.storage.local.set).toHaveBeenCalledTimes(1);
        const localCalls = global.chrome.storage.local.set.mock.calls[0][0];
        expect(localCalls[prompt.id]).toBe('Test Content');
    });

    it('should get all prompts (Hybrid Hydration)', async () => {
        const mockMeta = [{ id: '1', title: 'P1' }];
        const mockContent = { '1': 'Content 1' };

        // Mock Sync Get (Meta)
        global.chrome.storage.sync.get.mockImplementation((key, callback) => {
            // Also handles checkAndMigrate 'prompts' check
            if (key === 'prompts') callback({});
            if (key === 'prompts_meta') callback({ prompts_meta: mockMeta });
        });

        // Mock Local Get (Content)
        global.chrome.storage.local.get.mockImplementation((keys, callback) => {
            callback(mockContent);
        });

        const result = await getAllPrompts();

        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('P1');
        expect(result[0].content).toBe('Content 1');
    });

    it('should delete prompt (Hybrid)', async () => {
        const mockMeta = [{ id: '123', title: 'Target' }];

        global.chrome.storage.sync.get.mockImplementation((key, callback) => {
            callback({ prompts_meta: mockMeta });
        });

        global.chrome.storage.sync.set.mockImplementation((data, callback) => callback());
        global.chrome.storage.local.remove.mockImplementation((key, callback) => callback());

        const success = await deletePrompt('123');
        expect(success).toBe(true);

        // Verify sync update (empty list)
        expect(global.chrome.storage.sync.set).toHaveBeenCalledWith({
            prompts_meta: []
        }, expect.any(Function));

        // Verify local removal (content + variant + media keys)
        expect(global.chrome.storage.local.remove).toHaveBeenCalledWith(
            ['123', '123_v', '123_media'], expect.any(Function)
        );
    });

    it('should preserve lock, stats and timestamps on import', async () => {
        // Restoring a backup used to pass {} as extraMeta, so every PIN-locked
        // prompt came back unlocked and its usage stats reset to zero.
        global.chrome.storage.sync.get.mockImplementation((key, callback) => callback({ prompts_meta: [] }));
        global.chrome.storage.sync.set.mockImplementation((data, callback) => callback());
        global.chrome.storage.local.set.mockImplementation((data, callback) => callback());

        const backup = JSON.stringify([{
            id: 'prompt_old_1',
            title: 'Locked one',
            content: 'secret body',
            tags: [],
            createdAt: 1700000000000,
            lastUsed: 1700000009000,
            useCount: 7,
            locked: true,
            lockHash: 'deadbeef'
        }]);

        await importPrompts(backup, true);

        const saved = global.chrome.storage.sync.set.mock.calls[0][0].prompts_meta[0];
        expect(saved.locked).toBe(true);
        expect(saved.lockHash).toBe('deadbeef');
        expect(saved.useCount).toBe(7);
        expect(saved.createdAt).toBe(1700000000000);
        expect(saved.lastUsed).toBe(1700000009000);
        // The id is still regenerated, so an import can never collide with an existing prompt.
        expect(saved.id).not.toBe('prompt_old_1');
    });

    it('should not restore a lock whose hash is missing', async () => {
        global.chrome.storage.sync.get.mockImplementation((key, callback) => callback({ prompts_meta: [] }));
        global.chrome.storage.sync.set.mockImplementation((data, callback) => callback());
        global.chrome.storage.local.set.mockImplementation((data, callback) => callback());

        await importPrompts(JSON.stringify([
            { title: 'No hash', content: 'body', tags: [], locked: true }
        ]), true);

        const saved = global.chrome.storage.sync.set.mock.calls[0][0].prompts_meta[0];
        expect(saved.locked).toBe(false);
        expect(saved.lockHash).toBe(null);
    });
});
