/**
 * State Management Module
 */

export const state = {
    currentPrompts: [],
    allPrompts: [],
    editingPromptId: null,
    pendingAction: null,
    activeTagFilter: null,
    viewMode: 'list',
    sortDirection: 'desc'   // 'asc' | 'desc'
};

export const resetState = () => {
    state.currentPrompts = [];
    state.allPrompts = [];
    state.editingPromptId = null;
    state.pendingAction = null;
    state.activeTagFilter = null;
    state.viewMode = 'list';
    state.sortDirection = 'desc';
};
