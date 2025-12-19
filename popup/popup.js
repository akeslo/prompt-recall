// Popup JavaScript for Prompt Recall

// State management
let currentPrompts = [];
let selectedPromptId = null;
let editingPromptId = null;

// Markdown Converter
const converter = new showdown.Converter();

// DOM elements
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const addPromptBtn = document.getElementById('addPromptBtn');
const promptsList = document.getElementById('promptsList');
const emptyState = document.getElementById('emptyState');
const storageInfo = document.getElementById('storageInfo');

// Modal elements
const promptModal = document.getElementById('promptModal');
const settingsModal = document.getElementById('settingsModal');
const modalTitle = document.getElementById('modalTitle');
const promptTitle = document.getElementById('promptTitle');
const promptContent = document.getElementById('promptContent');
const promptTags = document.getElementById('promptTags');
const savePromptBtn = document.getElementById('savePromptBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeModal = document.getElementById('closeModal');

// Settings elements
const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsModal = document.getElementById('closeSettingsModal');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const clearAllBtn = document.getElementById('clearAllBtn');

// Variable Modal elements
const variableModal = document.getElementById('variableModal');
const variableInputs = document.getElementById('variableInputs');
const confirmVariableBtn = document.getElementById('confirmVariableBtn');
const cancelVariableBtn = document.getElementById('cancelVariableBtn');
const closeVariableModal = document.getElementById('closeVariableModal');

let pendingAction = null; // Store action to perform after variable substitution

// Initialize the popup
async function init() {
  await loadPrompts();
  await updateStorageInfo();
  attachEventListeners();
  hljs.highlightAll();
}

// Load and display prompts
async function loadPrompts() {
  try {
    currentPrompts = await getAllPrompts();
    await applyFiltersAndSort();
    renderPrompts();
  } catch (error) {
    console.error('Error loading prompts:', error);
    showNotification('Error loading prompts', 'error');
  }
}

// Apply search filter and sorting
async function applyFiltersAndSort() {
  const query = searchInput.value.trim();
  const sortBy = sortSelect.value;

  // Filter by search query
  if (query) {
    currentPrompts = await searchPrompts(query);
  } else {
    currentPrompts = await getAllPrompts();
  }

  // Filter for Favorites Only mode
  if (sortBy === 'favorites') {
    currentPrompts = currentPrompts.filter(p => p.pinned);
  }

  // Sort prompts
  currentPrompts.sort((a, b) => {
    // Pinned prompts always first (unless we are already only showing pinned)
    if (sortBy !== 'favorites') {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
    }

    switch (sortBy) {
      case 'alphabetical':
        return a.title.localeCompare(b.title);
      case 'mostUsed':
        return (b.useCount || 0) - (a.useCount || 0);
      case 'lastUsed':
        if (!a.lastUsed) return 1;
        if (!b.lastUsed) return -1;
        return b.lastUsed - a.lastUsed;
      case 'favorites': // Fallback to recent date for tied favorites
      case 'recent':
      default:
        return b.createdAt - a.createdAt;
    }
  });
}

// Render prompts to the UI
function renderPrompts() {
  promptsList.innerHTML = '';

  if (currentPrompts.length === 0) {
    emptyState.style.display = 'flex';
    promptsList.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    promptsList.style.display = 'block';

    currentPrompts.forEach(prompt => {
      const card = createPromptCard(prompt);
      promptsList.appendChild(card);
    });

    // Check for overflow and show 'Show More' button if needed
    const cards = promptsList.querySelectorAll('.prompt-card');
    cards.forEach(card => {
      const contentEl = card.querySelector('.prompt-content');
      const showMoreBtn = card.querySelector('.show-more-btn');
      if (contentEl.scrollHeight > contentEl.clientHeight) {
        showMoreBtn.style.display = 'block';
      } else {
        showMoreBtn.style.display = 'none';
      }
    });

    hljs.highlightAll();
  }
}

// Create a prompt card element
function createPromptCard(prompt) {
  const card = document.createElement('div');
  card.className = 'prompt-card';
  card.dataset.promptId = prompt.id;

  // Format date
  const formattedDate = formatRelativeTime(prompt.createdAt);
  const contentHtml = converter.makeHtml(prompt.content);

  card.innerHTML = `
    <div class="prompt-header">
      <div class="prompt-title">${prompt.title}</div>
      <button class="pin-btn ${prompt.pinned ? 'pinned' : ''}" data-id="${prompt.id}" title="${prompt.pinned ? 'Unpin' : 'Pin to top'}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </button>
    </div>
    <div class="prompt-meta">
      <span title="${new Date(prompt.createdAt).toLocaleString()}">${formattedDate}</span>
      ${prompt.useCount ? `<span>• Used ${prompt.useCount}x</span>` : ''}
    </div>
    <div class="prompt-content-wrapper">
      <div class="prompt-content">${contentHtml}</div>
      <button class="show-more-btn" style="display: none;">Show More</button>
    </div>
    ${prompt.tags.length > 0 ? `
      <div class="prompt-tags">
        ${prompt.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
    ` : ''}
    <div class="prompt-actions">
      <button class="action-btn copy-btn" data-id="${prompt.id}">Copy</button>
      <button class="action-btn edit-btn" data-id="${prompt.id}">Edit</button>
      <button class="action-btn danger delete-btn" data-id="${prompt.id}">Delete</button>
    </div>
  `;

  // Add pinned class to card if needed
  if (prompt.pinned) {
    card.classList.add('pinned');
  }

  // Attach event listeners
  const pinBtn = card.querySelector('.pin-btn');
  const copyBtn = card.querySelector('.copy-btn');
  const editBtn = card.querySelector('.edit-btn');
  const deleteBtn = card.querySelector('.delete-btn');
  const showMoreBtn = card.querySelector('.show-more-btn');
  const contentEl = card.querySelector('.prompt-content');
  const tagsContainer = card.querySelector('.prompt-tags');

  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      contentEl.classList.add('expanded');
      showMoreBtn.style.display = 'none';
    });
  }

  if (tagsContainer) {
    tagsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag')) {
        e.stopPropagation();
        handleTagClick(e.target.textContent);
      }
    });
  }

  if (pinBtn) {
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(prompt.id);
    });
  }

  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleCopy(prompt.id, e.target);
  });

  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleEdit(prompt.id);
  });

  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDelete(prompt.id);
  });

  return card;
}

// Handle tag click
async function handleTagClick(tag) {
  searchInput.value = tag;
  await applyFiltersAndSort();
  renderPrompts();
}

// Handle copy action
async function handleCopy(promptId, buttonElement) {
  try {
    const prompt = currentPrompts.find(p => p.id === promptId);
    if (!prompt) return;

    // Check for variables
    const variables = extractVariables(prompt.content);

    if (variables.length > 0) {
      // Show modal to fill variables
      showVariableModal(prompt, variables, async (filledContent) => {
        await navigator.clipboard.writeText(filledContent);
        finalizeCopy(promptId, buttonElement);
      });
      return;
    }

    // Copy to clipboard
    await navigator.clipboard.writeText(prompt.content);
    finalizeCopy(promptId, buttonElement);
  } catch (error) {
    console.error('Error copying prompt:', error);
    showNotification('Failed to copy', 'error');
  }
}

async function finalizeCopy(promptId, buttonElement) {
  // Mark as used and update UI
  await markPromptAsUsed(promptId);

  // Visual feedback
  const originalText = buttonElement.textContent;
  buttonElement.textContent = 'Copied!';
  buttonElement.style.backgroundColor = 'var(--success-color)';
  buttonElement.style.color = 'white';

  setTimeout(async () => {
    buttonElement.textContent = originalText;
    buttonElement.style.backgroundColor = '';
    buttonElement.style.color = '';
    // No need to reload all prompts, just update the one that changed
    const promptCard = promptsList.querySelector(`[data-prompt-id="${promptId}"]`);
    if (promptCard) {
      const promptData = await getPrompt(promptId);
      const useCountEl = promptCard.querySelector('.prompt-meta span:last-child');
      if (useCountEl && promptData.useCount) {
        useCountEl.textContent = `• Used ${promptData.useCount}x`;
      } else if (promptData.useCount) {
        const metaEl = promptCard.querySelector('.prompt-meta');
        const newUseCountEl = document.createElement('span');
        newUseCountEl.textContent = `• Used ${promptData.useCount}x`;
        metaEl.appendChild(newUseCountEl);
      }
    }
  }, 1500);

  showNotification('Copied to clipboard!');
}

// Variable Handling
function extractVariables(content) {
  const regex = /{{(.*?)}}/g;
  const matches = [...content.matchAll(regex)];
  // Return unique variable names
  return [...new Set(matches.map(m => m[1].trim()))];
}

function showVariableModal(prompt, variables, onConfirm) {
  variableInputs.innerHTML = '';
  pendingAction = onConfirm;

  // Store the original template content
  variableModal.dataset.templateContent = prompt.content;

  variables.forEach(variable => {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = variable;
    label.style.textTransform = 'capitalize';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input variable-input';
    input.dataset.variable = variable;
    input.placeholder = `Enter value for ${variable}`;

    // Auto-focus first input
    if (variableInputs.children.length === 0) {
      setTimeout(() => input.focus(), 100);
    }

    group.appendChild(label);
    group.appendChild(input);
    variableInputs.appendChild(group);
  });

  variableModal.style.display = 'flex';
}

function processVariables() {
  if (!pendingAction) return;

  const templateContent = variableModal.dataset.templateContent;
  let finalContent = templateContent;
  const inputs = variableInputs.querySelectorAll('.variable-input');

  inputs.forEach(input => {
    const variable = input.dataset.variable;
    const value = input.value || ''; // Allow empty substitution
    // Replace all occurrences of {{variable}} with value
    const regex = new RegExp(`{{\\s*${escapeRegExp(variable)}\\s*}}`, 'g');
    finalContent = finalContent.replace(regex, value);
  });

  pendingAction(finalContent);
  variableModal.style.display = 'none';
  pendingAction = null;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Handle edit action
function handleEdit(promptId) {
  const prompt = currentPrompts.find(p => p.id === promptId);
  if (!prompt) return;

  editingPromptId = promptId;
  modalTitle.textContent = 'Edit Prompt';
  promptTitle.value = prompt.title;
  promptContent.value = prompt.content;
  promptTags.value = prompt.tags.join(', ');

  promptModal.style.display = 'flex';
  promptTitle.focus();
}

// Handle delete action
async function handleDelete(promptId) {
  if (!confirm('Are you sure you want to delete this prompt?')) {
    return;
  }

  try {
    await deletePrompt(promptId);
    await loadPrompts();
    await updateStorageInfo();
    showNotification('Prompt deleted');
  } catch (error) {
    console.error('Error deleting prompt:', error);
    showNotification('Failed to delete prompt', 'error');
  }
}

// Toggle pin status
async function togglePin(promptId) {
  try {
    const prompt = currentPrompts.find(p => p.id === promptId);
    if (!prompt) return;

    const newStatus = !prompt.pinned;

    // Optimistic update
    prompt.pinned = newStatus;
    await applyFiltersAndSort();
    renderPrompts();

    // Persist
    await updatePrompt(promptId, { pinned: newStatus });
  } catch (error) {
    console.error('Error toggling pin:', error);
    showNotification('Failed to update pin', 'error');
    // Revert on error
    await loadPrompts();
  }
}

// Show add prompt modal
async function showAddPromptModal() {
  editingPromptId = null;
  modalTitle.textContent = 'Add New Prompt';
  promptTitle.value = '';
  promptContent.value = '';
  promptTags.value = '';

  promptModal.style.display = 'flex';
  promptTitle.focus();

  // Pre-fill from clipboard
  try {
    const clipboardText = await navigator.clipboard.readText();
    if (clipboardText) {
      promptContent.value = clipboardText;
    }
  } catch (error) {
    console.warn('Failed to read clipboard or clipboard is empty:', error);
  }
}

// Save prompt (add or edit)
async function handleSavePrompt() {
  const title = promptTitle.value.trim();
  const content = promptContent.value.trim();
  const tagsInput = promptTags.value.trim();

  if (!content) {
    showNotification('Content is required', 'error');
    return;
  }

  const tags = tagsInput
    ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag)
    : [];

  try {
    if (editingPromptId) {
      // Update existing prompt
      await updatePrompt(editingPromptId, { title, content, tags });
      showNotification('Prompt updated!');
    } else {
      // Create new prompt
      await savePrompt(title, content, tags);
      showNotification('Prompt saved!');
    }

    promptModal.style.display = 'none';
    await loadPrompts();
    await updateStorageInfo();
  } catch (error) {
    console.error('Error saving prompt:', error);
    showNotification('Failed to save prompt', 'error');
  }
}

// Export prompts
async function handleExport() {
  try {
    const jsonData = await exportPrompts();
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-prompts-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showNotification('Prompts exported!');
  } catch (error) {
    console.error('Error exporting prompts:', error);
    showNotification('Failed to export prompts', 'error');
  }
}

// Import prompts
async function handleImport() {
  const file = importFile.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const count = await importPrompts(text, true);

    settingsModal.style.display = 'none';
    await loadPrompts();
    await updateStorageInfo();

    showNotification(`Imported ${count} prompts!`);
  } catch (error) {
    console.error('Error importing prompts:', error);
    showNotification('Failed to import prompts. Check file format.', 'error');
  } finally {
    importFile.value = '';
  }
}

// Clear all prompts
async function handleClearAll() {
  if (!confirm('Are you sure you want to delete ALL prompts? This cannot be undone.')) {
    return;
  }

  try {
    await chrome.storage.sync.set({ prompts: [] });
    settingsModal.style.display = 'none';
    await loadPrompts();
    await updateStorageInfo();
    showNotification('All prompts cleared');
  } catch (error) {
    console.error('Error clearing prompts:', error);
    showNotification('Failed to clear prompts', 'error');
  }
}

// Update storage info display
async function updateStorageInfo() {
  try {
    const info = await getStorageInfo();
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version;

    if (info) {
      const warningClass = info.percentage > 80 ? 'storage-warning' : '';
      storageInfo.innerHTML = `
        <span class="${warningClass}">
          Storage: ${formatBytes(info.usage)} / ${formatBytes(info.quota)} (${info.percentage}%)
        </span>
        <span style="margin-left: 8px; opacity: 0.7;">v${version}</span>
      `;
    }
  } catch (error) {
    console.error('Error updating storage info:', error);
  }
}

// Show notification
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Attach event listeners
function attachEventListeners() {
  // Search and sort
  searchInput.addEventListener('input', async () => {
    await applyFiltersAndSort();
    renderPrompts();
  });

  sortSelect.addEventListener('change', async () => {
    await applyFiltersAndSort();
    renderPrompts();
  });

  // Add prompt
  addPromptBtn.addEventListener('click', showAddPromptModal);

  // Modal actions
  savePromptBtn.addEventListener('click', handleSavePrompt);
  cancelBtn.addEventListener('click', () => {
    promptModal.style.display = 'none';
  });
  closeModal.addEventListener('click', () => {
    promptModal.style.display = 'none';
  });

  // Settings
  settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });

  closeSettingsModal.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  exportBtn.addEventListener('click', handleExport);
  importBtn.addEventListener('click', () => {
    importFile.click();
  });
  importFile.addEventListener('change', handleImport);
  clearAllBtn.addEventListener('click', handleClearAll);

  // Close modals on background click
  promptModal.addEventListener('click', (e) => {
    if (e.target === promptModal) {
      promptModal.style.display = 'none';
    }
  });

  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  // Variable Modal
  confirmVariableBtn.addEventListener('click', processVariables);

  cancelVariableBtn.addEventListener('click', () => {
    variableModal.style.display = 'none';
    pendingAction = null;
  });

  closeVariableModal.addEventListener('click', () => {
    variableModal.style.display = 'none';
    pendingAction = null;
  });

  variableModal.addEventListener('click', (e) => {
    if (e.target === variableModal) {
      variableModal.style.display = 'none';
      pendingAction = null;
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Focus search on "/" key
    if (e.key === '/' && !isModalOpen()) {
      e.preventDefault();
      searchInput.focus();
    }

    // Close modal on Escape
    if (e.key === 'Escape') {
      if (promptModal.style.display === 'flex') {
        promptModal.style.display = 'none';
      }
      if (settingsModal.style.display === 'flex') {
        settingsModal.style.display = 'none';
      }
      if (variableModal.style.display === 'flex') {
        variableModal.style.display = 'none';
        pendingAction = null;
      }
    }

    // Save on Ctrl+Enter in modal
    if (e.ctrlKey && e.key === 'Enter') {
      if (promptModal.style.display === 'flex') {
        handleSavePrompt();
      } else if (variableModal.style.display === 'flex') {
        processVariables();
      }
    }
  });
}

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function isModalOpen() {
  return promptModal.style.display === 'flex' || settingsModal.style.display === 'flex';
}

function formatRelativeTime(timestamp) {
  const now = new Date();
  const past = new Date(timestamp);
  const diffInSeconds = Math.floor((now - past) / 1000);

  const secondsInMinute = 60;
  const secondsInHour = 3600;
  const secondsInDay = 86400;

  if (diffInSeconds < 10) {
    return 'just now';
  } else if (diffInSeconds < secondsInMinute) {
    return `${diffInSeconds}s ago`;
  } else if (diffInSeconds < secondsInHour) {
    const minutes = Math.floor(diffInSeconds / secondsInMinute);
    return `${minutes}m ago`;
  } else if (diffInSeconds < secondsInDay) {
    const hours = Math.floor(diffInSeconds / secondsInHour);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffInSeconds / secondsInDay);
    if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
