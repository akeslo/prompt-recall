import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome global
global.chrome = {
    runtime: { lastError: null },
    storage: {
        sync: {
            get: vi.fn(),
            set: vi.fn(),
            QUOTA_BYTES: 102400,
            getBytesInUse: vi.fn()
        },
        onChanged: { addListener: vi.fn() }
    }
};

// Import module under test
// Note: using require for CJS compatibility if needed, but import usually works
import {
    savePrompt,
    getAllPrompts,
    getPrompt,
    deletePrompt,
    updatePrompt
} from '../lib/storage.js';

describe('Storage Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.chrome.runtime.lastError = null;
    });

    it('should save a new prompt', async () => {
        // Mock get to return empty array initially
        global.chrome.storage.sync.get.mockImplementation((key, callback) => {
            callback({ prompts: [] });
        });

        // Mock set to succeed
        global.chrome.storage.sync.set.mockImplementation((data, callback) => {
            callback();
        });

        const prompt = await savePrompt('Test Title', 'Test Content', ['tag1']);

        expect(prompt).toBeDefined();
        expect(prompt.title).toBe('Test Title');
        expect(prompt.content).toBe('Test Content');
        expect(prompt.tags).toEqual(['tag1']);
        expect(prompt.id).toBeDefined();

        expect(global.chrome.storage.sync.set).toHaveBeenCalledWith({
            prompts: expect.arrayContaining([expect.objectContaining({ title: 'Test Title' })])
        }, expect.any(Function));
    });

    it('should get all prompts', async () => {
        const mockPrompts = [{ id: '1', title: 'P1' }];
        global.chrome.storage.sync.get.mockImplementation((key, callback) => {
            callback({ prompts: mockPrompts });
        });

        const result = await getAllPrompts();
        expect(result).toEqual(mockPrompts);
    });

    it('should get prompt by id', async () => {
        const mockPrompts = [{ id: '123', title: 'Target' }, { id: '456', title: 'Other' }];
        global.chrome.storage.sync.get.mockImplementation((key, callback) => {
            callback({ prompts: mockPrompts });
        });

        const result = await getPrompt('123');
        expect(result).toEqual(mockPrompts[0]);
    });

    it('should delete prompt', async () => {
        const mockPrompts = [{ id: '123', title: 'Target' }];
        global.chrome.storage.sync.get.mockImplementation((key, callback) => {
            callback({ prompts: mockPrompts });
        });
        global.chrome.storage.sync.set.mockImplementation((data, callback) => {
            callback();
        });

        const success = await deletePrompt('123');
        expect(success).toBe(true);

        // Verify set is called with empty array
        expect(global.chrome.storage.sync.set).toHaveBeenCalledWith({
            prompts: []
        }, expect.any(Function));
    });

    it('should handle delete of non-existent prompt', async () => {
        const mockPrompts = [{ id: '123', title: 'Target' }];
        global.chrome.storage.sync.get.mockImplementation((key, callback) => {
            callback({ prompts: mockPrompts });
        });

        const success = await deletePrompt('999');
        expect(success).toBe(false);
        expect(global.chrome.storage.sync.set).not.toHaveBeenCalled();
    });
});
