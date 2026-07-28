# Prompt Recall

A lightweight Chrome extension to capture, save, and organize AI prompts.

[**Download from Chrome Web Store**](https://chromewebstore.google.com/detail/prompt-recall/ckkifhpljcinjjnigafajnmljbmillpc?hl=en-US)

## Features

- **Quick Capture**: Save prompts via right-click menu or keyboard shortcut (Cmd+Shift+P / Ctrl+Shift+P)
- **Search & Organize**: Easy tagging, filtering, sorting (by recent, used, alphabetical, favorites)
- **Multiple Views**: Compact, list, or full-expanded view modes
- **Variants & Examples**: Store alternative phrasings and before/after images for each prompt
- **Appearance**: Customize theme color (preset swatches or custom picker) and font size (S/M/L)
- **Auto-Backup**: Scheduled backups to Downloads folder with customizable intervals
- **Cloud Sync**: Syncs across your Chrome browsers via Chrome Storage API
- **Privacy Focused**: No external servers, uses your Chrome sync storage

## Manual Installation

If you prefer not to use the Chrome Web Store:

1.  Download this repository or the latest release zip.

    Release zips are generated locally via `npm run build` (writes to `releases/`, not committed to git).
2.  Open Chrome and go to `chrome://extensions`.
3.  Enable **Developer mode** in the top right.
4.  Click **Load unpacked**.
5.  Select the `prompt-recall` folder (or the folder where you unzipped the files).

## Usage

- **Save**: Right-click text -> "Save as AI Prompt"
- **Use**: Click the extension icon to search, copy, or paste prompts
- **Edit**: Manage your prompts directly in the popup

---

[Made by akeslo 💻️](https://github.com/akeslo)

### Check out my other apps:

- [**Rerun Timer**](https://apps.apple.com/us/app/rerun-timer/id6755941416) - The Infinite Loop Timer
- [**PinkCloud Timer**](https://apps.apple.com/us/app/pinkcloud-timer/id6744997715) - Personal sobriety companion
- [**Breathe Wisely**](https://apps.apple.com/us/app/breathe-wisely/id6744491087) - Simple Stress Relief
