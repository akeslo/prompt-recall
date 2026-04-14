/**
 * State Management Module
 */

export const state = {
    currentPrompts: [],
    allPrompts: [],         // unfiltered, for tag discovery
    editingPromptId: null,
    pendingAction: null,
    activeTagFilter: null   // string | null
};

export const resetState = () => {
    state.currentPrompts = [];
    state.allPrompts = [];
    state.editingPromptId = null;
    state.pendingAction = null;
    state.activeTagFilter = null;
};
