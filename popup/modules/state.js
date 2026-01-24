/**
 * State Management Module
 */

export const state = {
    currentPrompts: [],
    editingPromptId: null,
    pendingAction: null
};

export const resetState = () => {
    state.currentPrompts = [];
    state.editingPromptId = null;
    state.pendingAction = null;
};
