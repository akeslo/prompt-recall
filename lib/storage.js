// Storage utility functions for Prompt Recall
// Implements Hybrid Storage Strategy:
// - Metadata (ID, Title, Tags, Stats) -> chrome.storage.sync (Cross-device, Low quota)
// - Content (Large text) -> chrome.storage.local (Local only, Large quota)

/**
 * Generate a unique ID for a prompt
 */
function generateId() {
  return 'prompt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Internal: Get raw metadata from sync storage
 */
async function getMetadata() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get('prompts_meta', (items) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(items.prompts_meta || []);
    });
  });
}

/**
 * Internal: Get raw content from local storage
 */
async function getContent(id) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(id, (items) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(items[id] || '');
    });
  });
}

/**
 * Internal: Migration check
 * Detects legacy "prompts" key in sync storage and migrates to hybrid.
 */
async function checkAndMigrate() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('prompts', async (items) => {
      if (items.prompts && Array.isArray(items.prompts) && items.prompts.length > 0) {
        console.log('Migrating legacy prompts to hybrid storage...');
        const legacyPrompts = items.prompts;
        const meta = [];
        const contentMap = {};

        legacyPrompts.forEach(p => {
          const { content, ...metadata } = p;
          meta.push(metadata);
          contentMap[p.id] = content;
        });

        // Save to new locations
        await new Promise(r => chrome.storage.sync.set({ prompts_meta: meta }, r));
        await new Promise(r => chrome.storage.local.set(contentMap, r));

        // Clear legacy
        await new Promise(r => chrome.storage.sync.remove('prompts', r));
        console.log('Migration complete.');
      }
      resolve();
    });
  });
}

/**
 * Get all prompts (hydrated with content) or just metadata
 * @param {boolean} metadataOnly - If true, returns only metadata (faster for lists)
 */
async function getAllPrompts(metadataOnly = false) {
  try {
    await checkAndMigrate();
    const meta = await getMetadata();

    if (metadataOnly) return meta;

    // Hydrate content
    // Note: Fetching all content might be slow for massive libraries using getAll().
    // Optimization: The UI currently calls getAllPrompts() to render everything.
    // Ideally we should lazy load content, but for now we maintain API compatibility.

    // Optimizing: Batch get from local storage?
    // chrome.storage.local.get(null) gets everything, or pass array of keys.
    const keys = meta.map(p => p.id);
    if (keys.length === 0) return [];

    const contentMap = await new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (items) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(items);
      });
    });

    return meta.map(p => ({
      ...p,
      content: contentMap[p.id] || ''
    }));

  } catch (error) {
    console.error('Error getting prompts:', error);
    return [];
  }
}

/**
 * Get a single prompt by ID
 */
async function getPrompt(id) {
  try {
    // We can fetch just the specific key from local and find ID in meta
    const metaList = await getMetadata();
    const meta = metaList.find(p => p.id === id);
    if (!meta) return null;

    const content = await getContent(id);
    return { ...meta, content };
  } catch (error) {
    console.error('Error getting prompt:', error);
    return null;
  }
}

/**
 * Save a new prompt
 */
async function savePrompt(title, content, tags = []) {
  try {
    const metaList = await getMetadata();
    const id = generateId();

    const newMeta = {
      id,
      title: title || 'Untitled Prompt',
      tags: tags,
      createdAt: Date.now(),
      lastUsed: null,
      useCount: 0
    };

    metaList.push(newMeta);

    // Save Meta to Sync
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ prompts_meta: metaList }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });

    // Save Content to Local
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [id]: content }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });

    return { ...newMeta, content };
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
    const metaList = await getMetadata();
    const index = metaList.findIndex(p => p.id === id);

    if (index === -1) throw new Error('Prompt not found');

    // Separate content updates from metadata updates
    const { content, ...metaUpdates } = updates;

    // Update Metadata
    metaList[index] = { ...metaList[index], ...metaUpdates };
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ prompts_meta: metaList }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });

    // Update Content if present
    if (content !== undefined) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [id]: content }, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    }

    return getPrompt(id); // Return full hydrated object
  } catch (error) {
    console.error('Error updating prompt:', error);
    throw error;
  }
}

/**
 * Delete a prompt
 */
async function deletePrompt(id) {
  try {
    const metaList = await getMetadata();
    const filteredMeta = metaList.filter(p => p.id !== id);

    if (filteredMeta.length === metaList.length) return false;

    // Remove from Sync
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ prompts_meta: filteredMeta }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });

    // Remove from Local
    await new Promise((resolve) => {
      chrome.storage.local.remove(id, resolve);
    });

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
    // This only touches metadata, so it's fast and lightweight
    const metaList = await getMetadata();
    const index = metaList.findIndex(p => p.id === id);

    if (index !== -1) {
      metaList[index].useCount = (metaList[index].useCount || 0) + 1;
      metaList[index].lastUsed = Date.now();

      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({ prompts_meta: metaList }, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    }
  } catch (error) {
    console.error('Error marking prompt as used:', error);
  }
}

/**
 * Export all prompts as JSON (Hydrated)
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
    let importedPrompts;
    if (typeof validateImport !== 'undefined') {
      const result = validateImport(jsonString);
      if (!result.valid) {
        throw new Error(`Validation failed: ${result.errors.join(', ')}`);
      }
      importedPrompts = result.data;
    } else {
      // Fallback
      importedPrompts = JSON.parse(jsonString);
      if (!Array.isArray(importedPrompts)) throw new Error('Invalid format');
    }

    // If not merging, clear existing. But implementation of creating clear logic is hard with hybrid.
    // For now we assume merge=true logic or just append. 
    // If merge=false was passed (overwrite), we should clear first.
    if (!merge) {
      // Clear all logic
      await new Promise(r => chrome.storage.sync.remove('prompts_meta', r));
      await new Promise(r => chrome.storage.local.clear(r));
    }

    // Process one by one using savePrompt to ensure proper ID generation and splitting
    // Parallelize for speed? savePrompt is async.
    // Using simple loop to avoid race conditions on sync storage write (metaList read/write cycle)
    for (const prompt of importedPrompts) {
      // If importing with existing IDs, current savePrompt regenerates ID. 
      // This is safer to avoid conflicts.
      await savePrompt(prompt.title, prompt.content, prompt.tags);
    }

    return importedPrompts.length;
  } catch (error) {
    console.error('Error importing prompts:', error);
    throw error;
  }
}

/**
 * Search prompts by query string
 */
async function searchPrompts(query) {
  // To search content, we must hydrate. 
  // Performance trade-off: We load all content to search it.
  const prompts = await getAllPrompts();

  if (!query || query.trim() === '') return prompts;

  const lowerQuery = query.toLowerCase();
  return prompts.filter(prompt => {
    const titleMatch = prompt.title.toLowerCase().includes(lowerQuery);
    const contentMatch = prompt.content.toLowerCase().includes(lowerQuery);
    const tagsMatch = prompt.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
    return titleMatch || contentMatch || tagsMatch;
  });
}

/**
 * Get storage usage information
 */
async function getStorageInfo() {
  try {
    const syncBytes = await chrome.storage.sync.getBytesInUse();
    const localBytes = await chrome.storage.local.getBytesInUse();

    const quota = chrome.storage.sync.QUOTA_BYTES;
    // We strictly track sync quota as it's the bottleneck. 
    // Though local storage adds to total bytes, the "Warning" should focus on Sync.

    const percentage = (syncBytes / quota) * 100;

    return {
      usage: syncBytes, // Representing "Cloud Usage"
      localUsage: localBytes, // Info only
      quota,
      percentage: percentage.toFixed(2),
      remaining: quota - syncBytes
    };
  } catch (error) {
    console.error('Error getting storage info:', error);
    return null;
  }
}

// Export functions
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
    getPrompt,
    getStorageInfo
  };
}
