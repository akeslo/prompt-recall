import { describe, it, expect, beforeEach } from 'vitest';
import { state, resetState } from '../popup/modules/state.js';

describe('state module', () => {
    beforeEach(() => resetState());

    it('exposes the documented default fields', () => {
        expect(state).toEqual({
            currentPrompts: [],
            allPrompts: [],
            editingPromptId: null,
            pendingAction: null,
            activeTagFilter: null,
            viewMode: 'list',
            sortDirection: 'desc'
        });
    });

    it('resetState clears every field back to its default', () => {
        state.currentPrompts = [{ id: 1 }];
        state.allPrompts = [{ id: 1 }, { id: 2 }];
        state.editingPromptId = 'abc';
        state.pendingAction = () => {};
        state.activeTagFilter = 'work';
        state.viewMode = 'grid';
        state.sortDirection = 'asc';

        resetState();

        expect(state.currentPrompts).toEqual([]);
        expect(state.allPrompts).toEqual([]);
        expect(state.editingPromptId).toBeNull();
        expect(state.pendingAction).toBeNull();
        expect(state.activeTagFilter).toBeNull();
        expect(state.viewMode).toBe('list');
        expect(state.sortDirection).toBe('desc');
    });

    it('resetState mutates the shared object in place and covers all keys', () => {
        const ref = state;
        const keys = Object.keys(state);
        state.viewMode = 'full';
        resetState();
        expect(state).toBe(ref);
        expect(Object.keys(state)).toEqual(keys);
    });
});
