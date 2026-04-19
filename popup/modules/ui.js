/**
 * UI Manager Module
 * Handles DOM manipulation and rendering.
 */

// DOM elements
export const elements = {
    searchInput: document.getElementById('searchInput'),
    sortSelect: document.getElementById('sortSelect'),
    tagFilterStrip: document.getElementById('tagFilterStrip'),
    addPromptBtn: document.getElementById('addPromptBtn'),
    promptsList: document.getElementById('promptsList'),
    emptyState: document.getElementById('emptyState'),
    storageInfo: document.getElementById('storageInfo'),

    // Modal elements
    promptModal: document.getElementById('promptModal'),
    settingsModal: document.getElementById('settingsModal'),
    modalTitle: document.getElementById('modalTitle'),
    promptTitle: document.getElementById('promptTitle'),
    promptContent: document.getElementById('promptContent'),
    promptTags: document.getElementById('promptTags'),
    savePromptBtn: document.getElementById('savePromptBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    closeModal: document.getElementById('closeModal'),

    // Settings elements
    settingsBtn: document.getElementById('settingsBtn'),
    closeSettingsModal: document.getElementById('closeSettingsModal'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    clearAllBtn: document.getElementById('clearAllBtn'),

    // Variable Modal elements
    variableModal: document.getElementById('variableModal'),
    variableInputs: document.getElementById('variableInputs'),
    confirmVariableBtn: document.getElementById('confirmVariableBtn'),
    cancelVariableBtn: document.getElementById('cancelVariableBtn'),
    closeVariableModal: document.getElementById('closeVariableModal'),

    // Lock Modal elements
    lockModal: document.getElementById('lockModal'),
    lockPinInput: document.getElementById('lockPinInput'),
    lockPinError: document.getElementById('lockPinError'),
    confirmLockBtn: document.getElementById('confirmLockBtn'),
    cancelLockBtn: document.getElementById('cancelLockBtn'),
    closeLockModal: document.getElementById('closeLockModal'),

    // Edit modal lock fields
    promptLockToggle: document.getElementById('promptLockToggle'),
    lockPinHint: document.getElementById('lockPinHint'),

    // PIN Setup Modal
    pinSetupModal: document.getElementById('pinSetupModal'),
    pinSetupTitle: document.getElementById('pinSetupTitle'),
    pinCurrentGroup: document.getElementById('pinCurrentGroup'),
    pinCurrentInput: document.getElementById('pinCurrentInput'),
    pinNewInput: document.getElementById('pinNewInput'),
    pinConfirmInput: document.getElementById('pinConfirmInput'),
    pinSetupError: document.getElementById('pinSetupError'),
    confirmPinSetupBtn: document.getElementById('confirmPinSetupBtn'),
    cancelPinSetupBtn: document.getElementById('cancelPinSetupBtn'),
    closePinSetupModal: document.getElementById('closePinSetupModal'),

    // Settings PIN section
    pinStatusText: document.getElementById('pinStatusText'),
    managePinBtn: document.getElementById('managePinBtn'),
    clearPinBtn: document.getElementById('clearPinBtn'),

    // Settings samples
    loadSamplesBtn: document.getElementById('loadSamplesBtn'),

    // Welcome modal
    welcomeModal: document.getElementById('welcomeModal'),
    skipSamplesBtn: document.getElementById('skipSamplesBtn'),
    loadSamplesWelcomeBtn: document.getElementById('loadSamplesWelcomeBtn')
};

/**
 * Check if any modal is currently open
 */
export function isModalOpen() {
    return elements.promptModal.style.display === 'flex' ||
        elements.settingsModal.style.display === 'flex' ||
        elements.variableModal.style.display === 'flex' ||
        elements.lockModal.style.display === 'flex' ||
        elements.pinSetupModal.style.display === 'flex' ||
        elements.welcomeModal.style.display === 'flex';
}

/**
 * Format relative time string
 */
export function formatRelativeTime(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);

    const secondsInMinute = 60;
    const secondsInHour = 3600;
    const secondsInDay = 86400;

    if (diffInSeconds < 10) return 'just now';
    if (diffInSeconds < secondsInMinute) return `${diffInSeconds}s ago`;
    if (diffInSeconds < secondsInHour) return `${Math.floor(diffInSeconds / secondsInMinute)}m ago`;
    if (diffInSeconds < secondsInDay) return `${Math.floor(diffInSeconds / secondsInHour)}h ago`;
    return `${Math.floor(diffInSeconds / secondsInDay)}d ago`;
}

/**
 * Format bytes to readable string
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Update storage info display
 */
export function renderStorageInfo(info, version) {
    if (!info) return;
    const warningClass = info.percentage > 80 ? 'storage-warning' : '';
    elements.storageInfo.innerHTML = `
    <span class="${warningClass}">
      Storage: ${formatBytes(info.usage)} / ${formatBytes(info.quota)} (${info.percentage}%)
    </span>
    <span style="margin-left: 8px; opacity: 0.7;">v${version}</span>
  `;
}

/**
 * Show a toaster notification
 */
export function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}
