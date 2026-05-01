// Background service worker for Prompt Recall

import { savePrompt, exportPrompts } from '/lib/storage.js';

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Prompt Recall installed');

  chrome.contextMenus.create({
    id: 'saveAsPrompt',
    title: 'Save as AI Prompt',
    contexts: ['selection'],
  });

  _reRegisterBackupAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  _reRegisterBackupAlarm();
});

async function _reRegisterBackupAlarm() {
  const result = await chrome.storage.local.get(['autoBackupEnabled', 'autoBackupInterval']);
  if (!result.autoBackupEnabled) return;
  const periodInMinutes = result.autoBackupInterval || 360;
  await chrome.alarms.clear('autoBackup');
  chrome.alarms.create('autoBackup', { periodInMinutes });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, _tab) => {
  if (info.menuItemId === 'saveAsPrompt') {
    handleSaveSelection(info.selectionText);
  }
});

// Save selected text as a prompt
async function handleSaveSelection(text) {
  if (!text || text.trim().length === 0) {
    return;
  }

  try {
    // Create new prompt using the standardized utility (Hybrid Strategy ready)
    const title = text.length > 50 ? text.substring(0, 50) + '...' : text;
    const newPrompt = await savePrompt(title, text, []);

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon48.png',
      title: 'AI Prompt Saved',
      message: 'Your selected text has been saved as a prompt.',
      priority: 1,
    });

    console.log('Prompt saved from selection:', newPrompt);
  } catch (error) {
    console.error('Error saving prompt from selection:', error);

    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon48.png',
      title: 'Error',
      message: 'Failed to save prompt. Please try again.',
      priority: 2,
    });
  }
}


// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'promptSaved') {
    console.log('Prompt saved:', request.prompt);
    return false;
  }

  if (request.action === 'fetchImageUrl') {
    _fetchImageAsDataUrl(request.url)
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }

  return true;
});

async function _fetchImageAsDataUrl(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) throw new Error('URL is not an image');
    const blob = await res.blob();
    return await _blobToDataUrl(blob);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
}

function _blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// Monitor storage usage
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && (changes.prompts || changes.prompts_meta)) {
    checkStorageQuota();
  }
});

// Check storage quota and warn if approaching limit
async function checkStorageQuota() {
  try {
    const usage = await chrome.storage.sync.getBytesInUse();
    const quota = chrome.storage.sync.QUOTA_BYTES;
    const percentage = (usage / quota) * 100;

    if (percentage > 90) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '../icons/icon48.png',
        title: 'Storage Almost Full',
        message:
          'You are using ' +
          percentage.toFixed(0) +
          '% of your storage quota. Consider exporting and clearing old prompts.',
        priority: 2,
      });
    }

    console.log(`Storage usage: ${usage} / ${quota} bytes (${percentage.toFixed(2)}%)`);
  } catch (error) {
    console.error('Error checking storage quota:', error);
  }
}

// Handle keyboard commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-spotlight') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE_SPOTLIGHT' });
      }
    });
  }
});

// Auto-backup alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'autoBackup') return;
  await _runAutoBackup();
});

async function _runAutoBackup() {
  const result = await chrome.storage.local.get('autoBackupEnabled');
  if (!result.autoBackupEnabled) return;

  try {
    const json = await exportPrompts();
    const base64 = btoa(unescape(encodeURIComponent(json)));
    const dataUrl = `data:application/json;base64,${base64}`;
    const date = new Date().toISOString().slice(0, 10);
    const filename = `prompt-recall-backup-${date}.json`;

    await chrome.downloads.create({ url: dataUrl, filename, saveAs: false });
    await chrome.storage.local.set({ autoBackupLastTs: Date.now() });
  } catch (err) {
    console.error('Auto-backup failed:', err);
  }
}
