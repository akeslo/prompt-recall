// Storage utility functions for Prompt Recall
// Implements Hybrid Storage Strategy:
// - Metadata (ID, Title, Tags, Stats) -> chrome.storage.sync (Cross-device, Low quota)
// - Content (Large text) -> chrome.storage.local (Local only, Large quota)

import { validateImport } from '/lib/validator.js';

const GLOBAL_PIN_KEY = 'global_pin_hash';

async function getPromptMedia(id) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(`${id}_media`, items => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(items[`${id}_media`] || { before: null, after: null });
    });
  });
}

async function savePromptMedia(id, media) {
  const hasContent = media.before || media.after;
  if (!hasContent) {
    await new Promise((resolve, reject) => {
      chrome.storage.local.remove(`${id}_media`, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
    return false;
  }
  await new Promise((resolve, reject) => {
    chrome.storage.local.set({ [`${id}_media`]: media }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
  return true;
}

async function getGlobalPinHash() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(GLOBAL_PIN_KEY, (items) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(items[GLOBAL_PIN_KEY] || null);
    });
  });
}

async function setGlobalPinHash(hash) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [GLOBAL_PIN_KEY]: hash }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

async function clearGlobalPin() {
  return new Promise((resolve) => {
    chrome.storage.sync.remove(GLOBAL_PIN_KEY, resolve);
  });
}


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

    const varKeys = meta.map(p => `${p.id}_v`);
    const localMap = await new Promise((resolve, reject) => {
      chrome.storage.local.get([...keys, ...varKeys], (items) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(items);
      });
    });

    return meta.map(p => ({
      ...p,
      content: localMap[p.id] || '',
      variants: _parseVariants(localMap[`${p.id}_v`])
    }));

  } catch (error) {
    console.error('Error getting prompts:', error);
    return [];
  }
}

function _parseVariants(raw) {
  try { return JSON.parse(raw) || []; } catch { return []; }
}

/**
 * Get a single prompt by ID
 */
async function getPrompt(id) {
  try {
    const metaList = await getMetadata();
    const meta = metaList.find(p => p.id === id);
    if (!meta) return null;

    const localData = await new Promise((resolve, reject) => {
      chrome.storage.local.get([id, `${id}_v`], (items) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(items);
      });
    });

    return { ...meta, content: localData[id] || '', variants: _parseVariants(localData[`${id}_v`]) };
  } catch (error) {
    console.error('Error getting prompt:', error);
    return null;
  }
}

/**
 * Save a new prompt
 */
async function savePrompt(title, content, tags = [], extraMeta = {}, variants = [], media = null) {
  try {
    const metaList = await getMetadata();
    const id = generateId();

    const newMeta = {
      id,
      title: title || 'Untitled Prompt',
      tags: tags,
      createdAt: Date.now(),
      lastUsed: null,
      useCount: 0,
      locked: false,
      lockHash: null,
      variantCount: variants.length,
      hasMedia: !!(media && (media.before || media.after)),
      ...extraMeta
    };

    metaList.push(newMeta);

    // Save Meta to Sync
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ prompts_meta: metaList }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });

    // Save Content + Variants to Local
    const localPayload = { [id]: content };
    if (variants.length > 0) localPayload[`${id}_v`] = JSON.stringify(variants);
    await new Promise((resolve, reject) => {
      chrome.storage.local.set(localPayload, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });

    if (media) await savePromptMedia(id, media);

    return { ...newMeta, content, variants };
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

    // Separate local-only fields from metadata fields
    const { content, variants, media, ...metaUpdates } = updates;

    if (variants !== undefined) metaUpdates.variantCount = variants.length;
    if (media !== undefined) metaUpdates.hasMedia = await savePromptMedia(id, media);

    // Update Metadata
    metaList[index] = { ...metaList[index], ...metaUpdates };
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ prompts_meta: metaList }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });

    // Update local storage (content and/or variants)
    const localPayload = {};
    if (content !== undefined) localPayload[id] = content;
    if (variants !== undefined) {
      if (variants.length > 0) {
        localPayload[`${id}_v`] = JSON.stringify(variants);
      } else {
        await new Promise(r => chrome.storage.local.remove(`${id}_v`, r));
      }
    }
    if (Object.keys(localPayload).length > 0) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set(localPayload, () => {
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
      chrome.storage.local.remove([id, `${id}_v`, `${id}_media`], resolve);
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
    // Media lives in its own local key and is not hydrated by getAllPrompts, so it
    // has to be attached here — otherwise every export and every scheduled
    // auto-backup silently drops the before/after images.
    const hydrated = await Promise.all(
      prompts.map(async p => (p.hasMedia ? { ...p, media: await getPromptMedia(p.id) } : p))
    );
    return JSON.stringify(hydrated, null, 2);
  } catch (error) {
    console.error('Error exporting prompts:', error);
    throw error;
  }
}

/**
 * Carry the metadata an export legitimately owns back into an import.
 *
 * The id is deliberately NOT carried — savePrompt regenerates it to avoid
 * collisions. Everything else used to be dropped, which meant restoring a
 * backup silently unlocked every PIN-locked prompt and reset createdAt,
 * useCount and lastUsed. Each field is type-checked, since the import file is
 * user-supplied and the validator only covers title/content/tags.
 */
function _importableMeta(prompt) {
  const meta = {};
  if (typeof prompt.createdAt === 'number') meta.createdAt = prompt.createdAt;
  if (typeof prompt.lastUsed === 'number') meta.lastUsed = prompt.lastUsed;
  if (typeof prompt.useCount === 'number' && prompt.useCount >= 0) meta.useCount = prompt.useCount;
  // A lock is only restored when its hash came with it — `locked: true` with no
  // hash would be an unopenable prompt.
  if (prompt.locked === true && typeof prompt.lockHash === 'string' && prompt.lockHash) {
    meta.locked = true;
    meta.lockHash = prompt.lockHash;
  }
  return meta;
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

    // If merge=false (overwrite), clear the existing library first.
    // Scope the local clear to prompt-owned keys only: chrome.storage.local also
    // holds unrelated settings (accentColor, fontSize, view_mode, sortDirection,
    // autoBackup*, samples_offered), and a blanket clear() silently resets all of
    // them and unregisters auto-backup as a side effect of importing prompts.
    if (!merge) {
      const existingMeta = await getMetadata();
      const localKeys = existingMeta.flatMap(p => [p.id, `${p.id}_v`, `${p.id}_media`]);
      await new Promise(r => chrome.storage.sync.remove('prompts_meta', r));
      if (localKeys.length > 0) {
        await new Promise(r => chrome.storage.local.remove(localKeys, r));
      }
    }

    // Process one by one using savePrompt to ensure proper ID generation and splitting
    // Parallelize for speed? savePrompt is async.
    // Using simple loop to avoid race conditions on sync storage write (metaList read/write cycle)
    for (const prompt of importedPrompts) {
      // If importing with existing IDs, current savePrompt regenerates ID. 
      // This is safer to avoid conflicts.
      await savePrompt(
        prompt.title,
        prompt.content,
        prompt.tags,
        _importableMeta(prompt),
        prompt.variants || [],
        prompt.media || null
      );
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
    const variantsMatch = (prompt.variants || []).some(v =>
      v.content.toLowerCase().includes(lowerQuery) || (v.label || '').toLowerCase().includes(lowerQuery)
    );
    return titleMatch || contentMatch || tagsMatch || variantsMatch;
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
export {
  getAllPrompts,
  savePrompt,
  updatePrompt,
  deletePrompt,
  markPromptAsUsed,
  exportPrompts,
  importPrompts,
  searchPrompts,
  getPrompt,
  getStorageInfo,
  getGlobalPinHash,
  setGlobalPinHash,
  clearGlobalPin,
  getPromptMedia,
  savePromptMedia
};

