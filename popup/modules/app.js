/**
 * Core Application Logic
 * Orchestrates UI, State, and Storage.
 */

import { elements, isModalOpen, formatRelativeTime, renderStorageInfo, showNotification } from './ui.js';
import { state } from './state.js';
import { converter } from './config.js';
import {
    getAllPrompts,
    searchPrompts,
    savePrompt,
    updatePrompt,
    deletePrompt,
    markPromptAsUsed,
    exportPrompts,
    importPrompts,
    getStorageInfo,
    getPrompt,
    getGlobalPinHash,
    setGlobalPinHash,
    clearGlobalPin,
    getPromptMedia
} from '../../lib/storage.js';

// --- Sample Prompts ---

const SAMPLE_PROMPTS = [
    {
        title: 'Code Review',
        tags: ['coding'],
        content: `Review the following code and provide structured feedback:

**Bugs / edge cases** — anything that could break
**Performance** — inefficiencies or bottlenecks
**Security** — vulnerabilities or unsafe patterns
**Readability** — naming, structure, comments
**Best practices** — language/framework conventions

Code:
\`\`\`{{language}}
{{code}}
\`\`\`

Be specific and prioritise critical issues first. Suggest fixes, not just problems.`
    },
    {
        title: 'Debug Helper',
        tags: ['coding'],
        content: `Help me debug this systematically.

**Language / framework:** {{language}}
**What's happening:** {{symptom}}
**What should happen:** {{expected_behavior}}

\`\`\`
{{code_or_error}}
\`\`\`

Walk me through: most likely causes → how to confirm each → the fix. Start with the highest-probability cause.`
    },
    {
        title: 'SQL Query Writer',
        tags: ['coding', 'data'],
        content: `Write a SQL query for the following:

**Goal:** {{goal}}
**Tables / schema:** {{tables}}
**Database:** {{database_type}}
**Constraints:** {{any_constraints}}

Return:
1. The query (clean, formatted)
2. Plain-English explanation of what it does
3. Any indexes that would improve performance`
    },
    {
        title: 'Meeting Notes → Action Items',
        tags: ['productivity'],
        content: `Convert these meeting notes into a structured summary:

{{meeting_notes}}

Output format:
**TL;DR** (2 sentences max)
**Key Decisions**
**Action Items** (person + deadline where mentioned)
**Parking Lot** (open questions, deferred items)

Be ruthlessly concise. Omit pleasantries and filler.`
    },
    {
        title: 'Professional Email Reply',
        tags: ['writing'],
        content: `Write a professional reply to this email.

**Original email:**
{{email}}

**Tone:** {{tone}}
**Points to address:** {{points}}
**Anything to avoid:** {{avoid}}

Keep it under 150 words unless complexity demands more. No filler openers like "I hope this finds you well."`
    },
    {
        title: 'Explain Like I\'m New',
        tags: ['learning'],
        content: `Explain {{concept}} to someone who has never heard of it before.

Use one concrete analogy from everyday life. Under 120 words. End with a single sentence on why it matters in the real world.`
    },
    {
        title: 'Research Digest',
        tags: ['research'],
        content: `Summarise the following article or paper:

{{article_or_paste_text}}

Structure:
1. **Core claim** (one sentence)
2. **Key findings** (3–5 bullets)
3. **Method** (one sentence — how they studied it)
4. **Limitations / caveats**
5. **So what?** (why it matters, who should care)

Write for a smart reader with no domain expertise.`
    },
    {
        title: 'Story Scene Builder',
        tags: ['writing', 'creative'],
        content: `Write a vivid scene with this setup:

**Characters:** {{characters}}
**Setting:** {{setting}}
**Tension / conflict:** {{conflict}}
**Mood:** {{mood}}

Rules: show don't tell, use sensory detail, under 300 words, end on a hook that makes the reader turn the page.`
    },
    {
        title: 'Cinematic Portrait — Image Gen',
        tags: ['image-gen'],
        content: `## Cinematic Close-Up Portrait

**Subject:** {{subject}}
**Mood:** {{mood}}
**Lighting:** {{lighting}}
**Color grade:** {{color_grade}}

---

**Prompt:**

Cinematic close-up portrait of {{subject}}, {{mood}} mood, shot on 35mm film, 85mm f/1.4 lens, {{lighting}} lighting, shallow depth of field, subtle film grain, {{color_grade}} color grade, photorealistic, ultra-detailed --ar 2:3 --style raw --stylize 800`,
        variants: [
            {
                label: 'Studio / Clean',
                content: `## Studio / Clean Portrait

**Subject:** {{subject}}

---

Studio portrait of {{subject}}, clean white background, professional beauty lighting, sharp focus, editorial style, high-key, skin detail, Hasselblad medium format look --ar 2:3 --style raw`
            },
            {
                label: 'Dark / Moody',
                content: `## Dark / Moody Portrait

**Subject:** {{subject}}
**Color grade:** {{color_grade}}

---

Dark moody portrait of {{subject}}, single harsh light source, deep shadows, noir atmosphere, desaturated, film noir, {{color_grade}} tones --ar 2:3 --stylize 900`
            }
        ]
    },
    {
        title: 'Product Photography — Image Gen',
        tags: ['image-gen'],
        content: `## Product Photography

**Product:** {{product}}
**Background:** {{background}}
**Angle:** {{angle}}

---

**Prompt:**

Professional product photography of {{product}}, {{background}} background, soft studio lighting with subtle shadows, sharp focus throughout, commercial quality, {{angle}} angle, clean minimal composition, 4k --ar 1:1 --style raw`,
        variants: [
            {
                label: 'Lifestyle / In-Use',
                content: `## Lifestyle / In-Use Shot

**Product:** {{product}}

---

Lifestyle product photo of {{product}} in a real-world setting, natural light, shallow depth of field, warm tones, aspirational feel, editorial magazine style --ar 4:5`
            }
        ]
    }
];

async function checkFirstLaunch() {
    return new Promise(resolve => {
        chrome.storage.local.get('samples_offered', items => {
            if (chrome.runtime?.lastError) console.error('checkFirstLaunch:', chrome.runtime?.lastError);
            resolve(!items.samples_offered);
        });
    });
}

async function markSamplesOffered() {
    chrome.storage.local.set({ samples_offered: true }, () => {
        if (chrome.runtime?.lastError) console.error('markSamplesOffered:', chrome.runtime?.lastError);
    });
}

async function importSamplePrompts() {
    let count = 0;
    for (const p of SAMPLE_PROMPTS) {
        await savePrompt(p.title, p.content, p.tags, {}, p.variants || []);
        count++;
    }
    return count;
}

// --- Lock State ---
const unlockedIds = new Set();
let _globalPinHash = null; // cached on init, updated on PIN change

async function hashPin(pin) {
    const data = new TextEncoder().encode(pin);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPin(pin, storedHash) {
    return (await hashPin(pin)) === storedHash;
}

function isLocked(prompt) {
    return !!prompt.locked && !!_globalPinHash && !unlockedIds.has(prompt.id);
}

// --- Media ---

const mediaEditorState = { before: null, after: null };

function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const MAX = 480;
                const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
                const w = Math.round(img.width * ratio);
                const h = Math.round(img.height * ratio);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.78));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function compressDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image data'));
        img.onload = () => {
            const MAX = 480;
            const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
            const w = Math.round(img.width * ratio);
            const h = Math.round(img.height * ratio);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.78));
        };
        img.src = dataUrl;
    });
}

function applyMediaSlotImage(slotEl, dataUrl) {
    const placeholder = slotEl.querySelector('.media-slot-placeholder');
    const preview = slotEl.querySelector('.media-slot-preview');
    const removeBtn = slotEl.querySelector('.media-slot-remove');
    if (dataUrl) {
        preview.src = dataUrl;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        removeBtn.style.display = 'flex';
    } else {
        preview.src = '';
        preview.style.display = 'none';
        placeholder.style.display = 'flex';
        removeBtn.style.display = 'none';
    }
}

async function loadCardMedia(card, promptId) {
    const section = card.querySelector('.card-media-section');
    if (!section || section.dataset.loaded) return;
    section.dataset.loaded = 'true';
    const media = await getPromptMedia(promptId);
    if (!media.before && !media.after) return;
    section.innerHTML = `
      <div class="card-media-row">
        ${media.before ? `<div class="card-media-item"><span class="card-media-label">Before</span><img src="${media.before}" alt="Before" class="card-media-img" /></div>` : ''}
        ${media.after  ? `<div class="card-media-item"><span class="card-media-label">After</span><img src="${media.after}" alt="After" class="card-media-img" /></div>` : ''}
      </div>`;
    section.querySelectorAll('.card-media-img').forEach(img => {
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            img.classList.toggle('zoomed');
        });
    });
}

function initMediaSlot(slotEl) {
    const slot = slotEl.dataset.slot;
    const fileInput = slotEl.querySelector('.media-file-input');
    const removeBtn = slotEl.querySelector('.media-slot-remove');
    const wrapper = slotEl.closest('.media-slot-wrapper');
    const urlRow = wrapper ? wrapper.querySelector('.media-url-row') : null;
    const urlToggle = wrapper ? wrapper.querySelector('.media-url-toggle') : null;
    const urlInput = urlRow ? urlRow.querySelector('.media-url-input') : null;
    const urlLoad = urlRow ? urlRow.querySelector('.media-url-load') : null;
    const urlCancel = urlRow ? urlRow.querySelector('.media-url-cancel') : null;

    slotEl.addEventListener('click', (e) => {
        if (e.target === removeBtn || removeBtn.contains(e.target)) return;
        fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        fileInput.value = '';
        try {
            const dataUrl = await compressImage(file);
            mediaEditorState[slot] = dataUrl;
            applyMediaSlotImage(slotEl, dataUrl);
        } catch {
            showNotification('Could not load image', 'error');
        }
    });

    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mediaEditorState[slot] = null;
        applyMediaSlotImage(slotEl, null);
    });

    // Drag-drop
    slotEl.addEventListener('dragover', (e) => { e.preventDefault(); slotEl.classList.add('drag-over'); });
    slotEl.addEventListener('dragleave', () => slotEl.classList.remove('drag-over'));
    slotEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        slotEl.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        try {
            const dataUrl = await compressImage(file);
            mediaEditorState[slot] = dataUrl;
            applyMediaSlotImage(slotEl, dataUrl);
        } catch {
            showNotification('Could not load image', 'error');
        }
    });

    // URL row wiring
    if (!urlToggle || !urlRow || !urlInput || !urlLoad || !urlCancel) return;

    urlToggle.addEventListener('click', () => {
        urlRow.style.display = 'flex';
        urlToggle.style.display = 'none';
        urlInput.focus();
    });

    urlCancel.addEventListener('click', () => {
        urlRow.style.display = 'none';
        urlToggle.style.display = '';
        urlInput.value = '';
        _clearUrlError(urlRow);
    });

    urlLoad.addEventListener('click', () => _loadFromUrl(slot, slotEl, urlRow, urlToggle, urlInput));

    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') _loadFromUrl(slot, slotEl, urlRow, urlToggle, urlInput);
        if (e.key === 'Escape') urlCancel.click();
    });
}

function _clearUrlError(urlRow) {
    // error is inserted after urlRow, not inside it (urlRow is display:flex)
    const next = urlRow.nextElementSibling;
    if (next && next.classList.contains('media-url-error')) next.remove();
}

async function _loadFromUrl(slot, slotEl, urlRow, urlToggle, urlInput) {
    const url = urlInput.value.trim();
    _clearUrlError(urlRow);
    if (!url) return;

    const loadBtn = urlRow.querySelector('.media-url-load');
    const cancelBtn = urlRow.querySelector('.media-url-cancel');
    loadBtn.textContent = 'Loading…';
    loadBtn.disabled = true;
    cancelBtn.disabled = true;

    try {
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'fetchImageUrl', url }, resolve);
        });

        if (!response || !response.ok) {
            throw new Error(response?.error || 'Failed to load image');
        }

        const compressed = await compressDataUrl(response.dataUrl);
        mediaEditorState[slot] = compressed;
        applyMediaSlotImage(slotEl, compressed);

        urlRow.style.display = 'none';
        urlToggle.style.display = '';
        urlInput.value = '';
    } catch (err) {
        const errEl = document.createElement('p');
        errEl.className = 'media-url-error';
        errEl.textContent = err.message || 'Could not load image from URL';
        urlRow.after(errEl);
    } finally {
        loadBtn.textContent = 'Load';
        loadBtn.disabled = false;
        cancelBtn.disabled = false;
    }
}

// --- View Mode ---

async function loadViewMode() {
    return new Promise(resolve => {
        chrome.storage.local.get('view_mode', items => {
            if (chrome.runtime?.lastError) console.error('loadViewMode:', chrome.runtime?.lastError);
            resolve(items.view_mode || 'list');
        });
    });
}

function saveViewMode(mode) {
    chrome.storage.local.set({ view_mode: mode }, () => {
        if (chrome.runtime?.lastError) console.error('saveViewMode:', chrome.runtime?.lastError);
    });
}

async function loadSortDirection() {
    return new Promise(resolve => {
        chrome.storage.local.get('sortDirection', items => {
            if (chrome.runtime?.lastError) console.error('loadSortDirection:', chrome.runtime?.lastError);
            resolve(items.sortDirection || 'desc');
        });
    });
}

function saveSortDirection(dir) {
    chrome.storage.local.set({ sortDirection: dir }, () => {
        if (chrome.runtime?.lastError) console.error('saveSortDirection:', chrome.runtime?.lastError);
    });
}

function applySortDirection(dir) {
    state.sortDirection = dir;
    const btn = elements.sortDirBtn;
    if (!btn) return;
    btn.classList.toggle('asc', dir === 'asc');
    btn.title = dir === 'asc' ? 'Sort descending' : 'Sort ascending';
    const icon = btn.querySelector('#sortDirIcon');
    if (icon) icon.setAttribute('d', dir === 'asc' ? 'M6 3l5 6H1l5-6z' : 'M6 9L1 3h10L6 9z');
}

// --- Theme ---

const DEFAULT_ACCENT = '#34d4a8';

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function applyAccentColor(hex) {
    const root = document.documentElement;
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-bg', hexToRgba(hex, 0.10));
    root.style.setProperty('--accent-bdr', hexToRgba(hex, 0.25));
    root.style.setProperty('--success-color', hex);
}

async function loadAccentColor() {
    return new Promise(resolve => {
        chrome.storage.local.get('accentColor', items => {
            if (chrome.runtime?.lastError) console.error('loadAccentColor:', chrome.runtime?.lastError);
            resolve(items.accentColor || null);
        });
    });
}

function saveAccentColor(hex) {
    if (hex === DEFAULT_ACCENT) {
        chrome.storage.local.remove('accentColor', () => {
            if (chrome.runtime?.lastError) console.error('saveAccentColor (remove):', chrome.runtime?.lastError);
        });
    } else {
        chrome.storage.local.set({ accentColor: hex }, () => {
            if (chrome.runtime?.lastError) console.error('saveAccentColor:', chrome.runtime?.lastError);
        });
    }
}

function updateThemeSwatchUI(activeHex) {
    const swatches = document.querySelectorAll('.theme-swatch[data-color]');
    swatches.forEach(s => s.classList.toggle('active', s.dataset.color === activeHex));
    const customSwatch = document.getElementById('themeCustomSwatch');
    const isPreset = [...swatches].some(s => s.dataset.color === activeHex);
    if (customSwatch) customSwatch.classList.toggle('active', !isPreset);
}

// --- Font Size ---

function applyFontSize(size) {
    document.body.classList.remove('font-size-s', 'font-size-m', 'font-size-l');
    if (size !== 'm') document.body.classList.add(`font-size-${size}`);
}

async function loadFontSize() {
    return new Promise(resolve => {
        chrome.storage.local.get('fontSize', items => {
            if (chrome.runtime?.lastError) console.error('loadFontSize:', chrome.runtime?.lastError);
            resolve(items.fontSize || 'm');
        });
    });
}

function saveFontSize(size) {
    chrome.storage.local.set({ fontSize: size }, () => {
        if (chrome.runtime?.lastError) console.error('saveFontSize:', chrome.runtime?.lastError);
    });
}

// --- Auto-Backup ---

async function loadBackupSettings() {
    return new Promise(resolve => {
        chrome.storage.local.get(
            ['autoBackupEnabled', 'autoBackupInterval', 'autoBackupLastTs'],
            items => {
                if (chrome.runtime?.lastError) console.error('loadBackupSettings:', chrome.runtime?.lastError);
                resolve({
                    enabled: !!items.autoBackupEnabled,
                    interval: items.autoBackupInterval || 360,
                    lastTs: items.autoBackupLastTs || null
                });
            }
        );
    });
}

function _formatBackupTs(ts) {
    if (!ts) return 'Never backed up.';
    return 'Last backup: ' + formatRelativeTime(ts);
}

async function applyBackupSettings({ enabled, interval, lastTs }) {
    elements.autoBackupToggle.checked = enabled;
    elements.autoBackupInterval.value = String(interval);
    elements.autoBackupOptions.style.display = enabled ? 'block' : 'none';
    elements.autoBackupLastTs.textContent = _formatBackupTs(lastTs);
}

async function _setBackupAlarm(enabled, intervalMinutes) {
    await chrome.alarms.clear('autoBackup');
    if (enabled) {
        chrome.alarms.create('autoBackup', { periodInMinutes: intervalMinutes });
    }
    chrome.storage.local.set({
        autoBackupEnabled: enabled,
        autoBackupInterval: intervalMinutes
    }, () => {
        if (chrome.runtime?.lastError) console.error('_setBackupAlarm:', chrome.runtime?.lastError);
    });
}

function updateFontSizeBtnUI(activeSize) {
    document.querySelectorAll('.font-size-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === activeSize);
    });
}

function applyViewMode(mode) {
    const list = elements.promptsList;
    list.classList.remove('view-compact', 'view-list', 'view-grid', 'view-full');
    if (mode !== 'list') list.classList.add(`view-${mode}`);
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
    state.viewMode = mode;
}

// --- Variant Editor State ---
const variantEditorState = { items: [] }; // [{ label, content }]

function renderVariantsList() {
    const list = document.getElementById('variantsList');
    if (!list) return;
    list.innerHTML = '';
    variantEditorState.items.forEach((v, i) => {
        const item = document.createElement('div');
        item.className = 'variant-editor-item';
        item.innerHTML = `
          <div class="variant-editor-header">
            <input type="text" class="form-input variant-label-input" placeholder="Label (e.g. Shorter, Formal…)" value="${_esc(v.label)}" data-vidx="${i}" />
            <button type="button" class="variant-remove-btn icon-btn" data-vidx="${i}" title="Remove variant">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 8.586L2.929 1.515 1.515 2.929 8.586 10l-7.071 7.071 1.414 1.414L10 11.414l7.071 7.071 1.414-1.414L11.414 10l7.071-7.071-1.414-1.414L10 8.586z"/></svg>
            </button>
          </div>
          <textarea class="form-textarea variant-content-input" rows="4" placeholder="Enter alternative prompt…" data-vidx="${i}">${_esc(v.content)}</textarea>
        `;
        item.querySelector('.variant-label-input').addEventListener('input', e => {
            variantEditorState.items[i].label = e.target.value;
        });
        item.querySelector('.variant-content-input').addEventListener('input', e => {
            variantEditorState.items[i].content = e.target.value;
        });
        item.querySelector('.variant-remove-btn').addEventListener('click', () => {
            variantEditorState.items.splice(i, 1);
            renderVariantsList();
        });
        list.appendChild(item);
    });
}

function _esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DISALLOWED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form']);

// showdown does not sanitize raw HTML embedded in markdown source (e.g. a saved
// prompt containing a literal <script> or an onerror= attribute passes straight
// through converter.makeHtml). Strip it before the result is set via innerHTML.
// Companion to the title/tag escaping fixed in 12a70e0 — this closes the same
// injection class for rendered prompt/variant content.
function sanitizeRenderedHtml(html) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    const walk = (node) => {
        [...node.children].forEach(el => {
            if (DISALLOWED_TAGS.has(el.tagName.toLowerCase())) {
                el.remove();
                return;
            }
            [...el.attributes].forEach(attr => {
                const name = attr.name.toLowerCase();
                const value = attr.value.trim().toLowerCase();
                if (name.startsWith('on') || (['href', 'src'].includes(name) && value.startsWith('javascript:'))) {
                    el.removeAttribute(attr.name);
                }
            });
            walk(el);
        });
    };
    walk(doc.body);
    return doc.body.innerHTML;
}

// --- Tag Picker State ---
const tagPickerState = { selected: new Set() };

function getAllExistingTags() {
    const all = new Set();
    state.allPrompts.forEach(p => (p.tags || []).forEach(t => all.add(t)));
    return [...all].sort();
}

function renderTagPicker(preselected = []) {
    tagPickerState.selected = new Set(preselected);
    _refreshTagPickerUI();
}

function _refreshTagPickerUI() {
    const selectedEl = document.getElementById('tagSelected');
    const suggestEl = document.getElementById('tagSuggestions');
    if (!selectedEl || !suggestEl) return;

    // Selected chips
    selectedEl.innerHTML = '';
    tagPickerState.selected.forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.innerHTML = `${_esc(tag)}<button class="tag-chip-remove" aria-label="Remove ${_esc(tag)}">×</button>`;
        chip.querySelector('.tag-chip-remove').addEventListener('click', () => {
            tagPickerState.selected.delete(tag);
            _refreshTagPickerUI();
        });
        selectedEl.appendChild(chip);
    });

    // Suggestions (all existing tags)
    const existing = getAllExistingTags();
    suggestEl.innerHTML = '';
    existing.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'tag-suggest-btn' + (tagPickerState.selected.has(tag) ? ' selected' : '');
        btn.textContent = tag;
        btn.type = 'button';
        btn.addEventListener('click', () => {
            if (!tagPickerState.selected.has(tag)) {
                tagPickerState.selected.add(tag);
                _refreshTagPickerUI();
            }
        });
        suggestEl.appendChild(btn);
    });
}

function initTagPickerInput() {
    const input = document.getElementById('promptTags');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
            e.preventDefault();
            const val = input.value.trim().replace(/,$/, '');
            if (val) {
                tagPickerState.selected.add(val);
                input.value = '';
                _refreshTagPickerUI();
            }
        }
    });
    // Also handle blur — add whatever is typed
    input.addEventListener('blur', () => {
        const val = input.value.trim().replace(/,$/, '');
        if (val) {
            tagPickerState.selected.add(val);
            input.value = '';
            _refreshTagPickerUI();
        }
    });
}

// --- Core Logic ---

export async function init() {
    _globalPinHash = await getGlobalPinHash();
    const savedView = await loadViewMode();
    const savedDir = await loadSortDirection();
    const savedAccent = await loadAccentColor();
    if (savedAccent) applyAccentColor(savedAccent);
    await loadPrompts();
    applyViewMode(savedView);
    applySortDirection(savedDir);
    updateThemeSwatchUI(savedAccent || DEFAULT_ACCENT);
    const savedFontSize = await loadFontSize();
    applyFontSize(savedFontSize);
    updateFontSizeBtnUI(savedFontSize);
    const backupSettings = await loadBackupSettings();
    await applyBackupSettings(backupSettings);
    await updateStorageInfoDisplay();
    await updatePinSettingsUI();
    attachEventListeners();
    initDragScroll(elements.tagFilterStrip);
    initTagPickerInput();
    initMediaSlot(document.getElementById('beforeSlot'));
    initMediaSlot(document.getElementById('afterSlot'));
    if (typeof hljs !== 'undefined') {
        hljs.highlightAll();
    }
    const isFirst = await checkFirstLaunch();
    if (isFirst) {
        setTimeout(() => { elements.welcomeModal.style.display = 'flex'; }, 200);
    }
}

async function loadPrompts() {
    try {
        state.allPrompts = await getAllPrompts();
        state.currentPrompts = state.allPrompts;
        await applyFiltersAndSort();
        renderPrompts();
        renderTagFilterStrip();
    } catch (error) {
        console.error('Error loading prompts:', error);
        showNotification('Error loading prompts', 'error');
    }
}

function initDragScroll(el) {
    if (!el) return;
    let isDown = false, startX, scrollLeft;
    el.addEventListener('mousedown', e => {
        if (e.target.classList.contains('tag-pill')) return;
        isDown = true;
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
    });
    el.addEventListener('mouseleave', () => { isDown = false; });
    el.addEventListener('mouseup', () => { isDown = false; });
    el.addEventListener('mousemove', e => {
        if (!isDown) return;
        e.preventDefault();
        el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX);
    });
}

function getAllUniqueTags() {
    const all = new Set();
    state.allPrompts.forEach(p => (p.tags || []).forEach(t => all.add(t)));
    return [...all].sort();
}

function renderTagFilterStrip() {
    const strip = elements.tagFilterStrip;
    if (!strip) return;

    const tags = getAllUniqueTags();
    if (tags.length === 0) { strip.style.display = 'none'; return; }

    strip.style.display = 'flex';
    strip.innerHTML = '';

    tags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'tag-pill' + (state.activeTagFilter === tag ? ' active' : '');
        btn.textContent = tag;
        btn.addEventListener('click', () => {
            state.activeTagFilter = state.activeTagFilter === tag ? null : tag;
            applyFiltersAndSort().then(() => { renderPrompts(); renderTagFilterStrip(); });
        });
        strip.appendChild(btn);
    });
}

async function updateStorageInfoDisplay() {
    try {
        const info = await getStorageInfo();
        const manifest = chrome.runtime.getManifest();
        renderStorageInfo(info, manifest.version);
    } catch (error) {
        console.error('Error updating storage info:', error);
    }
}

export async function applyFiltersAndSort() {
    const query = elements.searchInput.value.trim();
    const sortBy = elements.sortSelect.value;

    // Base: text search or full list
    if (query) {
        state.currentPrompts = await searchPrompts(query);
    } else {
        state.currentPrompts = [...state.allPrompts];
    }

    // Tag filter
    if (state.activeTagFilter) {
        state.currentPrompts = state.currentPrompts.filter(p =>
            (p.tags || []).includes(state.activeTagFilter)
        );
    }

    // Favorites mode filter
    if (sortBy === 'favorites') {
        state.currentPrompts = state.currentPrompts.filter(p => p.pinned);
    }

    // Sort
    const dir = state.sortDirection === 'asc' ? -1 : 1;
    state.currentPrompts.sort((a, b) => {
        if (sortBy !== 'favorites' && sortBy !== 'byTag') {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
        }

        switch (sortBy) {
            case 'alphabetical':
                return dir * a.title.localeCompare(b.title);
            case 'mostUsed':
                return dir * ((b.useCount || 0) - (a.useCount || 0));
            case 'lastUsed':
                if (!a.lastUsed && !b.lastUsed) return 0;
                if (!a.lastUsed) return 1;
                if (!b.lastUsed) return -1;
                return dir * (b.lastUsed - a.lastUsed);
            case 'byTag': {
                const ta = (a.tags && a.tags[0]) ? a.tags[0] : '\uFFFF';
                const tb = (b.tags && b.tags[0]) ? b.tags[0] : '\uFFFF';
                const cmp = ta.localeCompare(tb);
                return dir * (cmp !== 0 ? cmp : a.title.localeCompare(b.title));
            }
            case 'favorites':
            case 'recent':
            default:
                return dir * (b.createdAt - a.createdAt);
        }
    });
}

export function renderPrompts() {
    elements.promptsList.innerHTML = '';

    if (state.currentPrompts.length === 0) {
        elements.emptyState.style.display = 'flex';
        elements.promptsList.style.display = 'none';
    } else {
        elements.emptyState.style.display = 'none';
        elements.promptsList.style.display = 'block';

        state.currentPrompts.forEach(prompt => {
            const card = createPromptCard(prompt);
            elements.promptsList.appendChild(card);
            if (state.viewMode === 'full' && prompt.hasMedia) loadCardMedia(card, prompt.id);
        });

        if (typeof hljs !== 'undefined') {
            hljs.highlightAll();
        }
    }
}

export function createPromptCard(prompt) {
    const locked = isLocked(prompt);
    const variants = prompt.variants || [];
    const card = document.createElement('div');
    card.className = `prompt-card${prompt.pinned ? ' pinned' : ''}${locked ? ' locked' : ''}${state.viewMode === 'full' ? ' expanded' : ''}`;
    card.dataset.promptId = prompt.id;
    card.dataset.activeVariant = '-1';
    if (variants.length > 0) card.dataset.variants = JSON.stringify(variants);

    const formattedDate = formatRelativeTime(prompt.createdAt);
    const useText = prompt.useCount ? `${prompt.useCount}x` : '';
    const metaText = [formattedDate, useText].filter(Boolean).join(' · ');
    const contentHtml = locked
        ? '<div class="lock-placeholder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> locked</div>'
        : sanitizeRenderedHtml(converter.makeHtml(prompt.content));
    const tagsHtml = prompt.tags.length > 0
        ? prompt.tags.map(tag => `<span class="tag">${_esc(tag)}</span>`).join('')
        : '';

    card.innerHTML = `
    <div class="card-row">
      <button class="pin-btn ${prompt.pinned ? 'pinned' : ''}" data-id="${prompt.id}" title="${prompt.pinned ? 'Unpin' : 'Pin to top'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${prompt.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </button>
      <div class="card-info">
        <span class="prompt-title">${_esc(prompt.title) || 'Untitled'}${locked ? ' <span class="lock-icon" title="Locked"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>' : ''}${variants.length > 0 ? ` <span class="variant-badge" title="${variants.length} variant${variants.length > 1 ? 's' : ''}">${variants.length + 1}</span>` : ''}${prompt.hasMedia ? ' <span class="media-badge" title="Has before/after examples"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></span>' : ''}</span>
        <div class="card-footer-row">
          ${tagsHtml ? `<div class="prompt-tags">${tagsHtml}</div>` : ''}
          <span class="meta-text">${metaText}</span>
        </div>
      </div>
    </div>
    <div class="card-actions">
      <button class="action-btn copy-btn" data-id="${prompt.id}">${locked ? '🔒 Copy' : 'Copy'}</button>
      <button class="action-btn edit-btn" data-id="${prompt.id}">${locked ? '🔒 Edit' : 'Edit'}</button>
      <button class="action-btn danger delete-btn" data-id="${prompt.id}">Del</button>
    </div>
    <div class="prompt-content-wrapper">
      ${prompt.hasMedia && !locked ? '<div class="card-media-section"></div>' : ''}
      ${variants.length > 0 && !locked ? `<div class="variant-tabs">
        <button class="variant-tab active" data-vidx="-1">Primary</button>
        ${variants.map((v, i) => `<button class="variant-tab" data-vidx="${i}">${_esc(v.label || `Variant ${i + 1}`)}</button>`).join('')}
      </div>` : ''}
      <div class="prompt-content">${contentHtml}</div>
    </div>
  `;

    // Click row to expand/collapse content
    const cardRow = card.querySelector('.card-row');
    cardRow.addEventListener('click', (e) => {
        if (e.target.closest('.pin-btn') || e.target.closest('.card-actions')) return;
        const expanding = !card.classList.contains('expanded');
        card.classList.toggle('expanded');
        if (expanding && prompt.hasMedia) loadCardMedia(card, prompt.id);

    });

    // Tag clicks
    card.querySelectorAll('.tag').forEach(tagEl => {
        tagEl.addEventListener('click', (e) => {
            e.stopPropagation();
            handleTagClick(tagEl.textContent);
        });
    });

    card.querySelector('.pin-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePin(prompt.id);
    });

    // Variant tab switching
    card.querySelectorAll('.variant-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(tab.dataset.vidx);
            card.dataset.activeVariant = String(idx);
            card.querySelectorAll('.variant-tab').forEach(t => t.classList.toggle('active', t === tab));
            const contentEl = card.querySelector('.prompt-content');
            const raw = idx === -1
                ? prompt.content
                : (variants[idx]?.content || '');
            contentEl.innerHTML = sanitizeRenderedHtml(converter.makeHtml(raw));
            if (typeof hljs !== 'undefined') hljs.highlightAll();
        });
    });

    card.querySelector('.copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const activeVariant = parseInt(card.dataset.activeVariant ?? '-1');
        handleCopy(prompt.id, e.currentTarget, activeVariant, prompt.variants || []);
    });

    card.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handleEdit(prompt.id);
    });

    card.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handleDelete(prompt.id, e.currentTarget);
    });

    return card;
}

// --- User Actions ---

async function handleTagClick(tag) {
    state.activeTagFilter = state.activeTagFilter === tag ? null : tag;
    await applyFiltersAndSort();
    renderPrompts();
    renderTagFilterStrip();
}

async function handleCopy(promptId, buttonElement, variantIdx = -1, cachedVariants = []) {
    try {
        const prompt = await getPrompt(promptId);
        if (!prompt) return;

        if (prompt.locked && !unlockedIds.has(promptId)) {
            showLockModal(prompt, () => handleCopy(promptId, buttonElement, variantIdx, cachedVariants));
            return;
        }

        const allVariants = prompt.variants?.length ? prompt.variants : cachedVariants;
        const contentToCopy = variantIdx >= 0 ? (allVariants[variantIdx]?.content || prompt.content) : prompt.content;
        const variables = extractVariables(contentToCopy);

        if (variables.length > 0) {
            showVariableModal({ ...prompt, content: contentToCopy }, variables, async (filledContent) => {
                await navigator.clipboard.writeText(filledContent);
                finalizeCopy(promptId, buttonElement);
            });
            return;
        }

        await navigator.clipboard.writeText(contentToCopy);
        finalizeCopy(promptId, buttonElement);
    } catch (error) {
        console.error('Error copying prompt:', error);
        showNotification('Failed to copy', 'error');
    }
}

async function finalizeCopy(promptId, buttonElement) {
    await markPromptAsUsed(promptId);

    const originalText = buttonElement.textContent;
    buttonElement.textContent = 'Copied!';
    buttonElement.style.backgroundColor = 'var(--success-color)';
    buttonElement.style.color = 'white';

    setTimeout(async () => {
        buttonElement.textContent = originalText;
        buttonElement.style.backgroundColor = '';
        buttonElement.style.color = '';

        // Update meta text in UI
        const promptCard = elements.promptsList.querySelector(`[data-prompt-id="${promptId}"]`);
        if (promptCard) {
            const promptData = await getPrompt(promptId);
            const metaEl = promptCard.querySelector('.meta-text');
            if (metaEl && promptData) {
                const date = formatRelativeTime(promptData.createdAt);
                const useText = promptData.useCount ? `${promptData.useCount}x` : '';
                metaEl.textContent = [date, useText].filter(Boolean).join(' · ');
            }
        }
    }, 1500);

    showNotification('Copied to clipboard!');
}

async function handleDelete(promptId, buttonElement) {
    if (!buttonElement.dataset.confirming) {
        buttonElement.dataset.confirming = 'true';
        const originalText = buttonElement.innerHTML;
        buttonElement.dataset.originalText = originalText;
        buttonElement.textContent = 'Confirm?';
        buttonElement.classList.add('confirming');

        const timer = setTimeout(() => {
            if (buttonElement.dataset.confirming === 'true') {
                buttonElement.dataset.confirming = '';
                buttonElement.innerHTML = originalText;
                buttonElement.classList.remove('confirming');
            }
        }, 4000);
        buttonElement.dataset.timerId = timer;
        return;
    }

    try {
        if (buttonElement.dataset.timerId) clearTimeout(parseInt(buttonElement.dataset.timerId));
        buttonElement.disabled = true;
        buttonElement.textContent = 'Deleting...';

        const success = await deletePrompt(promptId);

        if (success) {
            const promptCard = document.querySelector(`[data-prompt-id="${promptId}"]`);
            if (promptCard) {
                promptCard.classList.add('deleting');
                await new Promise(resolve => setTimeout(resolve, 300));
                await loadPrompts();
                await updateStorageInfoDisplay();
                showNotification('Prompt deleted');
            }
        } else {
            showNotification('Could not find prompt to delete', 'error');
            resetDeleteButton(buttonElement);
        }
    } catch (error) {
        console.error('Error deleting prompt:', error);
        showNotification(`Delete failed: ${error.message || 'Storage error'}`, 'error');
        resetDeleteButton(buttonElement);
    }
}

function resetDeleteButton(btn) {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText;
    btn.dataset.confirming = '';
    btn.classList.remove('confirming');
}

async function togglePin(promptId) {
    try {
        const prompt = await getPrompt(promptId);
        if (!prompt) return;

        const newStatus = !prompt.pinned;
        await updatePrompt(promptId, { pinned: newStatus });

        // Optimistic UI update via full reload (safer)
        await loadPrompts();
    } catch (error) {
        console.error('Error toggling pin:', error);
        showNotification('Failed to update pin', 'error');
    }
}

function handleEdit(promptId) {
    const prompt = state.currentPrompts.find(p => p.id === promptId);
    if (!prompt) return;

    if (prompt.locked && !unlockedIds.has(promptId)) {
        showLockModal(prompt, () => handleEdit(promptId));
        return;
    }

    state.editingPromptId = promptId;
    elements.modalTitle.textContent = 'Edit Prompt';
    elements.promptTitle.value = prompt.title;
    elements.promptContent.value = prompt.content;
    elements.promptTags.value = '';
    renderTagPicker(prompt.tags);

    variantEditorState.items = (prompt.variants || []).map(v => ({ label: v.label || '', content: v.content || '' }));
    renderVariantsList();

    // Load existing media
    mediaEditorState.before = null;
    mediaEditorState.after = null;
    applyMediaSlotImage(document.getElementById('beforeSlot'), null);
    applyMediaSlotImage(document.getElementById('afterSlot'), null);
    if (prompt.hasMedia) {
        getPromptMedia(promptId).then(media => {
            mediaEditorState.before = media.before;
            mediaEditorState.after = media.after;
            applyMediaSlotImage(document.getElementById('beforeSlot'), media.before);
            applyMediaSlotImage(document.getElementById('afterSlot'), media.after);
        });
    }

    elements.promptLockToggle.checked = !!prompt.locked;
    elements.lockPinHint.style.display = prompt.locked ? 'block' : 'none';

    elements.promptModal.style.display = 'flex';
    elements.promptTitle.focus();
}

// --- Variable Logic ---

export function extractVariables(content) {
    const regex = /{{(.*?)}}/g;
    const matches = [...content.matchAll(regex)];
    return [...new Set(matches.map(m => m[1].trim()))];
}

function showVariableModal(prompt, variables, onConfirm) {
    elements.variableInputs.innerHTML = '';
    state.pendingAction = onConfirm;
    elements.variableModal.dataset.templateContent = prompt.content;

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

        group.appendChild(label);
        group.appendChild(input);
        elements.variableInputs.appendChild(group);
    });

    elements.variableModal.style.display = 'flex';
    // Focus first input
    if (elements.variableInputs.children.length > 0) {
        setTimeout(() => elements.variableInputs.children[0].querySelector('input').focus(), 100);
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function processVariables() {
    if (!state.pendingAction) return;

    const templateContent = elements.variableModal.dataset.templateContent;
    let finalContent = templateContent;
    const inputs = elements.variableInputs.querySelectorAll('.variable-input');

    inputs.forEach(input => {
        const variable = input.dataset.variable;
        const value = input.value || '';
        const regex = new RegExp(`{{\\s*${escapeRegExp(variable)}\\s*}}`, 'g');
        finalContent = finalContent.replace(regex, value);
    });

    state.pendingAction(finalContent);
    elements.variableModal.style.display = 'none';
    state.pendingAction = null;
}

// --- Lock Modal ---

function showLockModal(prompt, onSuccess) {
    elements.lockPinInput.value = '';
    elements.lockPinError.style.display = 'none';
    elements.lockModal.dataset.promptId = prompt.id;
    state.pendingAction = onSuccess;
    elements.lockModal.style.display = 'flex';
    setTimeout(() => elements.lockPinInput.focus(), 50);
}

async function handleConfirmLock() {
    const pin = elements.lockPinInput.value;
    const promptId = elements.lockModal.dataset.promptId;
    const ok = _globalPinHash && await verifyPin(pin, _globalPinHash);
    if (!ok) {
        elements.lockPinError.style.display = 'block';
        elements.lockPinInput.select();
        return;
    }
    unlockedIds.add(promptId);
    elements.lockModal.style.display = 'none';
    const action = state.pendingAction;
    state.pendingAction = null;
    if (action) action();
}

function dismissLockModal() {
    elements.lockModal.style.display = 'none';
    elements.lockPinInput.value = '';
    elements.lockPinError.style.display = 'none';
    state.pendingAction = null;
}

// --- PIN Setup Modal ---

let _pinSetupOnSuccess = null;
let _pinSetupOnCancel = null;

function showPinSetupModal(mode, _unused, onSuccess, onCancel) {
    const isChange = mode === 'change';
    elements.pinSetupTitle.textContent = isChange ? 'Change Global PIN' : 'Set Global PIN';
    elements.confirmPinSetupBtn.textContent = isChange ? 'Change PIN' : 'Set PIN';
    elements.pinCurrentGroup.style.display = isChange ? 'block' : 'none';
    elements.pinCurrentInput.value = '';
    elements.pinNewInput.value = '';
    elements.pinConfirmInput.value = '';
    elements.pinSetupError.style.display = 'none';
    elements.pinSetupError.textContent = '';
    _pinSetupOnSuccess = onSuccess || null;
    _pinSetupOnCancel = onCancel || null;
    elements.pinSetupModal.dataset.mode = mode;
    elements.pinSetupModal.style.display = 'flex';
    setTimeout(() => (isChange ? elements.pinCurrentInput : elements.pinNewInput).focus(), 50);
}

async function handleConfirmPinSetup() {
    const mode = elements.pinSetupModal.dataset.mode;
    const newPin = elements.pinNewInput.value;
    const confirmPin = elements.pinConfirmInput.value;

    if (mode === 'change') {
        if (!_globalPinHash || !(await verifyPin(elements.pinCurrentInput.value, _globalPinHash))) {
            elements.pinSetupError.textContent = 'Current PIN is incorrect.';
            elements.pinSetupError.style.display = 'block';
            elements.pinCurrentInput.select();
            return;
        }
    }

    if (newPin.length < 4) {
        elements.pinSetupError.textContent = 'PIN must be at least 4 characters.';
        elements.pinSetupError.style.display = 'block';
        elements.pinNewInput.focus();
        return;
    }

    if (newPin !== confirmPin) {
        elements.pinSetupError.textContent = 'PINs do not match.';
        elements.pinSetupError.style.display = 'block';
        elements.pinConfirmInput.select();
        return;
    }

    const newHash = await hashPin(newPin);
    await setGlobalPinHash(newHash);
    _globalPinHash = newHash;

    const successCb = _pinSetupOnSuccess;
    _pinSetupOnSuccess = null;
    _pinSetupOnCancel = null;
    _closePinSetupModal();
    await updatePinSettingsUI();
    showNotification('PIN set!');
    if (successCb) successCb();
}

function _closePinSetupModal() {
    elements.pinSetupModal.style.display = 'none';
    elements.pinCurrentInput.value = '';
    elements.pinNewInput.value = '';
    elements.pinConfirmInput.value = '';
    elements.pinSetupError.style.display = 'none';
}

function dismissPinSetupModal() {
    const cancelCb = _pinSetupOnCancel;
    _pinSetupOnSuccess = null;
    _pinSetupOnCancel = null;
    _closePinSetupModal();
    if (cancelCb) cancelCb();
}

async function updatePinSettingsUI() {
    if (_globalPinHash) {
        elements.pinStatusText.textContent = 'Global PIN is set.';
        elements.managePinBtn.textContent = 'Change PIN';
        elements.clearPinBtn.style.display = 'inline-flex';
    } else {
        elements.pinStatusText.textContent = 'No PIN set.';
        elements.managePinBtn.textContent = 'Set PIN';
        elements.clearPinBtn.style.display = 'none';
    }
}

// --- Modal & Global Handlers ---

async function showAddPromptModal() {
    state.editingPromptId = null;
    elements.modalTitle.textContent = 'Add New Prompt';
    elements.promptTitle.value = '';
    elements.promptContent.value = '';
    elements.promptTags.value = '';
    renderTagPicker([]);
    variantEditorState.items = [];
    renderVariantsList();
    mediaEditorState.before = null;
    mediaEditorState.after = null;
    applyMediaSlotImage(document.getElementById('beforeSlot'), null);
    applyMediaSlotImage(document.getElementById('afterSlot'), null);
    elements.promptLockToggle.checked = false;
    elements.lockPinHint.style.display = 'none';

    elements.promptModal.style.display = 'flex';
    elements.promptTitle.focus();

    try {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText) {
            elements.promptContent.value = clipboardText;
        }
    } catch (error) {
        console.warn('Clipboard read failed:', error);
    }
}

async function handleSavePrompt() {
    const title = elements.promptTitle.value.trim();
    const content = elements.promptContent.value.trim();

    const rawInput = elements.promptTags.value.trim().replace(/,$/, '');
    if (rawInput) tagPickerState.selected.add(rawInput);

    if (!content) {
        showNotification('Content is required', 'error');
        return;
    }

    const tags = [...tagPickerState.selected];
    const variants = variantEditorState.items
        .map(v => ({ label: v.label.trim(), content: v.content.trim() }))
        .filter(v => v.content);
    const lockEnabled = elements.promptLockToggle.checked;

    if (lockEnabled && !_globalPinHash) {
        showNotification('Set a global PIN in Settings first', 'error');
        return;
    }

    const lockUpdates = { locked: lockEnabled };

    try {
        const media = { before: mediaEditorState.before, after: mediaEditorState.after };

        if (state.editingPromptId) {
            await updatePrompt(state.editingPromptId, { title, content, tags, variants, media, ...lockUpdates });
            if (!lockEnabled) unlockedIds.delete(state.editingPromptId);
            showNotification('Prompt updated!');
        } else {
            await savePrompt(title, content, tags, lockUpdates, variants, media);
            showNotification('Prompt saved!');
        }

        elements.promptModal.style.display = 'none';
        await loadPrompts();
        await updateStorageInfoDisplay();
    } catch (error) {
        console.error('Error saving prompt:', error);
        showNotification('Failed to save prompt', 'error');
    }
}

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
        console.error('Export failed:', error);
        showNotification('Failed to export prompts', 'error');
    }
}

async function handleImport() {
    const file = elements.importFile.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const count = await importPrompts(text, true);

        elements.settingsModal.style.display = 'none';
        await loadPrompts();
        await updateStorageInfoDisplay();
        showNotification(`Imported ${count} prompts!`);
    } catch (error) {
        console.error('Import failed:', error);
        showNotification('Failed to import prompts. Check file format.', 'error');
    } finally {
        elements.importFile.value = '';
    }
}

async function handleClearAll(buttonElement) {
    // ... simple clear logic reusing confirm pattern ...
    // For brevity in this refactor, implying simplified logic or reusing existing pattern
    // The original code had a complex confirm logic within the handler. 
    // Implementing simplified version here for modularity.

    if (!buttonElement.dataset.confirming) {
        buttonElement.dataset.confirming = 'true';
        buttonElement.textContent = 'Confirm Clear All?';
        setTimeout(() => {
            buttonElement.dataset.confirming = '';
            buttonElement.textContent = 'Clear All Prompts';
        }, 5000);
        return;
    }

    try {
        // Delete sequentially: deletePrompt does a read-modify-write of the shared
        // prompts_meta array, so running them in parallel loses deletions to
        // last-write-wins on chrome.storage.sync.
        const all = await getAllPrompts();
        for (const p of all) {
            await deletePrompt(p.id);
        }

        showNotification('All prompts cleared');
        elements.settingsModal.style.display = 'none';
        await loadPrompts();
        await updateStorageInfoDisplay();
    } catch {
        showNotification('Failed to clear', 'error');
    }
}

// --- Event Listeners ---

function populateKeyboardShortcuts() {
    const container = document.getElementById('keyboardShortcuts');
    if (!container) return;

    // Clear existing shortcuts
    container.replaceChildren();

    const shortcuts = [
        {
            keys: ['Cmd', 'Shift', 'P'],
            label: 'Open Prompt Recall'
        }
    ];

    // Adjust keys for non-Mac platforms
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    if (!isMac) {
        shortcuts[0].keys = ['Ctrl', 'Shift', 'P'];
    }

    shortcuts.forEach(shortcut => {
        const item = document.createElement('div');
        item.className = 'keyboard-shortcut-item';

        const keyEl = document.createElement('div');
        keyEl.className = 'keyboard-shortcut-key';
        shortcut.keys.forEach((key, i) => {
            const kbd = document.createElement('kbd');
            kbd.textContent = key;
            keyEl.appendChild(kbd);
            if (i < shortcut.keys.length - 1) {
                const plus = document.createElement('span');
                plus.textContent = '+';
                plus.style.margin = '0 2px';
                plus.style.color = 'var(--text-muted)';
                keyEl.appendChild(plus);
            }
        });

        const label = document.createElement('div');
        label.className = 'keyboard-shortcut-label';
        label.textContent = shortcut.label;

        item.appendChild(keyEl);
        item.appendChild(label);
        container.appendChild(item);
    });
}

function attachEventListeners() {
    document.body.addEventListener('click', (e) => {
        const zoomed = document.querySelector('.card-media-img.zoomed');
        if (zoomed && e.target !== zoomed) zoomed.classList.remove('zoomed');
    });

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyViewMode(btn.dataset.view);
            saveViewMode(btn.dataset.view);
        });
    });

    elements.searchInput.addEventListener('input', async () => {
        await applyFiltersAndSort();
        renderPrompts();
        renderTagFilterStrip();
    });

    elements.sortDirBtn.addEventListener('click', async () => {
        const newDir = state.sortDirection === 'desc' ? 'asc' : 'desc';
        applySortDirection(newDir);
        saveSortDirection(newDir);
        await applyFiltersAndSort();
        renderPrompts();
    });

    elements.sortSelect.addEventListener('change', async () => {
        const isFavorites = elements.sortSelect.value === 'favorites';
        elements.sortDirBtn.disabled = isFavorites;
        await applyFiltersAndSort();
        renderPrompts();
        renderTagFilterStrip();
    });

    elements.addPromptBtn.addEventListener('click', showAddPromptModal);
    elements.savePromptBtn.addEventListener('click', handleSavePrompt);
    elements.cancelBtn.addEventListener('click', () => elements.promptModal.style.display = 'none');
    elements.closeModal.addEventListener('click', () => elements.promptModal.style.display = 'none');

    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsModal.style.display = 'flex';
        populateKeyboardShortcuts();
    });
    elements.closeSettingsModal.addEventListener('click', () => elements.settingsModal.style.display = 'none');
    elements.exportBtn.addEventListener('click', handleExport);
    elements.importBtn.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', handleImport);
    elements.clearAllBtn.addEventListener('click', (e) => handleClearAll(e.currentTarget));

    // Outside clicks
    window.addEventListener('click', (e) => {
        if (e.target === elements.promptModal) elements.promptModal.style.display = 'none';
        if (e.target === elements.settingsModal) elements.settingsModal.style.display = 'none';
        if (e.target === elements.variableModal) {
            elements.variableModal.style.display = 'none';
            state.pendingAction = null;
        }
        if (e.target === elements.lockModal) dismissLockModal();
        if (e.target === elements.pinSetupModal) dismissPinSetupModal();
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !isModalOpen()) {
            e.preventDefault();
            elements.searchInput.focus();
        }
        if (e.key === 'Escape') {
            elements.promptModal.style.display = 'none';
            elements.settingsModal.style.display = 'none';
            elements.variableModal.style.display = 'none';
            dismissLockModal();
            dismissPinSetupModal();
            state.pendingAction = null;
        }
        if (e.ctrlKey && e.key === 'Enter') {
            if (elements.promptModal.style.display === 'flex') handleSavePrompt();
            else if (elements.variableModal.style.display === 'flex') processVariables();
        }
    });

    elements.confirmVariableBtn.addEventListener('click', processVariables);
    elements.cancelVariableBtn.addEventListener('click', () => {
        elements.variableModal.style.display = 'none';
        state.pendingAction = null;
    });
    elements.closeVariableModal.addEventListener('click', () => {
        elements.variableModal.style.display = 'none';
        state.pendingAction = null;
    });

    // Variant editor
    document.getElementById('addVariantBtn').addEventListener('click', () => {
        variantEditorState.items.push({ label: '', content: '' });
        renderVariantsList();
        const list = document.getElementById('variantsList');
        list.lastElementChild?.querySelector('textarea')?.focus();
    });

    // Lock toggle in edit modal
    elements.promptLockToggle.addEventListener('change', () => {
        const on = elements.promptLockToggle.checked;
        elements.lockPinHint.style.display = on ? 'block' : 'none';
        if (on && !_globalPinHash) {
            showPinSetupModal('set', null,
                () => { /* PIN set — toggle stays checked */ },
                () => {
                    elements.promptLockToggle.checked = false;
                    elements.lockPinHint.style.display = 'none';
                }
            );
        }
    });

    // Lock modal
    elements.confirmLockBtn.addEventListener('click', handleConfirmLock);
    elements.cancelLockBtn.addEventListener('click', dismissLockModal);
    elements.closeLockModal.addEventListener('click', dismissLockModal);
    elements.lockPinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleConfirmLock();
        if (e.key === 'Escape') dismissLockModal();
    });

    // PIN Setup modal
    elements.confirmPinSetupBtn.addEventListener('click', handleConfirmPinSetup);
    elements.cancelPinSetupBtn.addEventListener('click', dismissPinSetupModal);
    elements.closePinSetupModal.addEventListener('click', dismissPinSetupModal);
    [elements.pinCurrentInput, elements.pinNewInput, elements.pinConfirmInput].forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleConfirmPinSetup();
            if (e.key === 'Escape') dismissPinSetupModal();
        });
    });

    // Welcome modal
    elements.skipSamplesBtn.addEventListener('click', async () => {
        await markSamplesOffered();
        elements.welcomeModal.style.display = 'none';
    });
    elements.loadSamplesWelcomeBtn.addEventListener('click', async () => {
        elements.loadSamplesWelcomeBtn.textContent = 'Loading…';
        elements.loadSamplesWelcomeBtn.disabled = true;
        await importSamplePrompts();
        await markSamplesOffered();
        elements.welcomeModal.style.display = 'none';
        await loadPrompts();
        await updateStorageInfoDisplay();
        showNotification('10 sample prompts loaded!');
    });

    // Settings: load samples
    elements.loadSamplesBtn.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!btn.dataset.confirming) {
            btn.dataset.confirming = 'true';
            btn.textContent = 'Add 10 prompts?';
            setTimeout(() => { btn.dataset.confirming = ''; btn.textContent = 'Load Sample Prompts'; }, 4000);
            return;
        }
        btn.dataset.confirming = '';
        btn.textContent = 'Loading…';
        btn.disabled = true;
        const count = await importSamplePrompts();
        btn.disabled = false;
        btn.textContent = 'Load Sample Prompts';
        elements.settingsModal.style.display = 'none';
        await loadPrompts();
        await updateStorageInfoDisplay();
        showNotification(`${count} sample prompts added!`);
    });

    // Settings PIN section
    elements.managePinBtn.addEventListener('click', () => {
        showPinSetupModal(_globalPinHash ? 'change' : 'set');
    });
    elements.clearPinBtn.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!btn.dataset.confirming) {
            btn.dataset.confirming = 'true';
            btn.textContent = 'Confirm?';
            setTimeout(() => { btn.dataset.confirming = ''; btn.textContent = 'Remove PIN'; }, 4000);
            return;
        }
        btn.dataset.confirming = '';
        await clearGlobalPin();
        _globalPinHash = null;
        unlockedIds.clear();
        await updatePinSettingsUI();
        await loadPrompts();
        showNotification('PIN removed');
    });

    // Theme swatches
    document.querySelectorAll('.theme-swatch[data-color]').forEach(swatch => {
        swatch.addEventListener('click', () => {
            const hex = swatch.dataset.color;
            applyAccentColor(hex);
            saveAccentColor(hex);
            updateThemeSwatchUI(hex);
        });
    });

    // Custom color swatch
    const customSwatch = document.getElementById('themeCustomSwatch');
    const customInput = elements.themeCustomInput;
    if (customSwatch && customInput) {
        customSwatch.addEventListener('click', (e) => {
            if (e.target !== customInput) customInput.click();
        });
        customInput.addEventListener('input', () => {
            const hex = customInput.value;
            applyAccentColor(hex);
            saveAccentColor(hex);
            updateThemeSwatchUI(hex);
        });
    }

    // Font size buttons
    document.querySelectorAll('.font-size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const size = btn.dataset.size;
            applyFontSize(size);
            saveFontSize(size);
            updateFontSizeBtnUI(size);
        });
    });

    // Auto-backup toggle
    elements.autoBackupToggle.addEventListener('change', async () => {
        const enabled = elements.autoBackupToggle.checked;
        const interval = parseInt(elements.autoBackupInterval.value) || 360;
        elements.autoBackupOptions.style.display = enabled ? 'block' : 'none';
        await _setBackupAlarm(enabled, interval);
    });

    // Auto-backup interval change
    elements.autoBackupInterval.addEventListener('change', async () => {
        const enabled = elements.autoBackupToggle.checked;
        const interval = parseInt(elements.autoBackupInterval.value);
        if (enabled) await _setBackupAlarm(true, interval);
        else chrome.storage.local.set({ autoBackupInterval: interval });
    });
}
