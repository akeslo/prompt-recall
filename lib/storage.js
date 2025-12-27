// Storage utility functions for Prompt Recall

/**
 * Generate a unique ID for a prompt
 */
function generateId() {
  return 'prompt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Helper to wrap chrome.storage.sync.set in a promise with error checking
 */
async function setStorageData(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get all prompts from storage
 */
async function getAllPrompts() {
  try {
    const result = await new Promise((resolve, reject) => {
      chrome.storage.sync.get('prompts', (items) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(items);
      });
    });
    return result.prompts || [];
  } catch (error) {
    console.error('Error getting prompts:', error);
    return [];
  }
}

/**
 * Save a new prompt
 */
async function savePrompt(title, content, tags = []) {
  try {
    const prompts = await getAllPrompts();
    const newPrompt = {
      id: generateId(),
      title: title || 'Untitled Prompt',
      content: content,
      tags: tags,
      createdAt: Date.now(),
      lastUsed: null,
      useCount: 0
    };

    prompts.push(newPrompt);
    await setStorageData({ prompts });
    console.log('Saved new prompt:', newPrompt.id);
    return newPrompt;
  } catch (error) {
    console.error('Error saving prompt:', error);
    throw error;
  }
}

/**
 * Update an existing prompt
 */
async function updatePrompt(id, updates) {
  try {
    const prompts = await getAllPrompts();
    const index = prompts.findIndex(p => p.id === id);

    if (index === -1) {
      throw new Error('Prompt not found');
    }

    prompts[index] = { ...prompts[index], ...updates };
    await setStorageData({ prompts });
    return prompts[index];
  } catch (error) {
    console.error('Error updating prompt:', error);
    throw error;
  }
}

/**
 * Delete a prompt
 */
async function deletePrompt(id) {
  console.log('Attempting to delete prompt with id:', id);
  try {
    const prompts = await getAllPrompts();
    const initialCount = prompts.length;

    // Normalize ID to string for comparison
    const targetId = String(id);
    const filtered = prompts.filter(p => String(p.id) !== targetId);

    if (filtered.length === initialCount) {
      console.warn('No prompt found with id:', targetId);
      return false;
    }

    await setStorageData({ prompts: filtered });

    console.log(`Successfully deleted prompt: ${targetId}. Remaining prompts: ${filtered.length}`);
    return true;
  } catch (error) {
    console.error('Error deleting prompt:', error);
    throw error;
  }
}

/**
 * Increment use count and update last used timestamp
 */
async function markPromptAsUsed(id) {
  try {
    const prompts = await getAllPrompts();
    const index = prompts.findIndex(p => p.id === id);

    if (index !== -1) {
      prompts[index].useCount = (prompts[index].useCount || 0) + 1;
      prompts[index].lastUsed = Date.now();
      await setStorageData({ prompts });
    }
  } catch (error) {
    console.error('Error marking prompt as used:', error);
  }
}

/**
 * Export all prompts as JSON
 */
async function exportPrompts() {
  try {
    const prompts = await getAllPrompts();
    return JSON.stringify(prompts, null, 2);
  } catch (error) {
    console.error('Error exporting prompts:', error);
    throw error;
  }
}

/**
 * Import prompts from JSON
 */
async function importPrompts(jsonString, merge = true) {
  try {
    const importedPrompts = JSON.parse(jsonString);

    if (!Array.isArray(importedPrompts)) {
      throw new Error('Invalid format: expected an array of prompts');
    }

    let prompts = merge ? await getAllPrompts() : [];

    // Add imported prompts, ensuring unique IDs
    importedPrompts.forEach(prompt => {
      // Regenerate ID to avoid conflicts
      prompt.id = generateId();
      prompts.push(prompt);
    });

    await setStorageData({ prompts });
    return prompts.length;
  } catch (error) {
    console.error('Error importing prompts:', error);
    throw error;
  }
}

/**
 * Search prompts by query string
 */
async function searchPrompts(query) {
  try {
    const prompts = await getAllPrompts();

    if (!query || query.trim() === '') {
      return prompts;
    }

    const lowerQuery = query.toLowerCase();

    return prompts.filter(prompt => {
      const titleMatch = prompt.title.toLowerCase().includes(lowerQuery);
      const contentMatch = prompt.content.toLowerCase().includes(lowerQuery);
      const tagsMatch = prompt.tags.some(tag => tag.toLowerCase().includes(lowerQuery));

      return titleMatch || contentMatch || tagsMatch;
    });
  } catch (error) {
    console.error('Error searching prompts:', error);
    return [];
  }
}

/**
 * Get storage usage information
 */
async function getStorageInfo() {
  try {
    const usage = await chrome.storage.sync.getBytesInUse();
    const quota = chrome.storage.sync.QUOTA_BYTES;
    const percentage = (usage / quota) * 100;

    return {
      usage,
      quota,
      percentage: percentage.toFixed(2),
      remaining: quota - usage
    };
  } catch (error) {
    console.error('Error getting storage info:', error);
    return null;
  }
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAllPrompts,
    savePrompt,
    updatePrompt,
    deletePrompt,
    markPromptAsUsed,
    exportPrompts,
    importPrompts,
    searchPrompts,
    getStorageInfo
  };
}
