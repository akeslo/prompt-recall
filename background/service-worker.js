// Background service worker for Prompt Recall

import { savePrompt } from '../lib/storage.js';

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Prompt Recall installed');

  // Create context menu for saving selected text as prompt
  chrome.contextMenus.create({
    id: 'saveAsPrompt',
    title: 'Save as AI Prompt',
    contexts: ['selection'],
  });
});

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
chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
  if (request.action === 'promptSaved') {
    // Handle any additional logic when a prompt is saved
    console.log('Prompt saved:', request.prompt);
  }

  return true;
});

// Monitor storage usage
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.prompts) {
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
