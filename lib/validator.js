/**
 * Input Validation Module
 * Enforces schema validation for prompt data.
 */

const MAX_TITLE_LENGTH = 100;
const MAX_TAGS_COUNT = 10;
const MAX_TAG_LENGTH = 30;

/**
 * Validate a single prompt object
 * @returns {object} { valid: boolean, error?: string }
 */
function validatePrompt(prompt) {
    if (!prompt || typeof prompt !== 'object') {
        return { valid: false, error: 'Invalid prompt format: not an object' };
    }

    // Title validation
    if (typeof prompt.title !== 'string') {
        return { valid: false, error: 'Title must be a string' };
    }
    if (prompt.title.length > MAX_TITLE_LENGTH) {
        return { valid: false, error: `Title exceeds max length of ${MAX_TITLE_LENGTH}` };
    }

    // Content validation
    if (typeof prompt.content !== 'string') {
        return { valid: false, error: 'Content must be a string' };
    }
    if (prompt.content.trim().length === 0) {
        return { valid: false, error: 'Content cannot be empty' };
    }

    // Tags validation
    if (!Array.isArray(prompt.tags)) {
        return { valid: false, error: 'Tags must be an array' };
    }
    if (prompt.tags.length > MAX_TAGS_COUNT) {
        return { valid: false, error: `Too many tags (max ${MAX_TAGS_COUNT})` };
    }
    for (const tag of prompt.tags) {
        if (typeof tag !== 'string') {
            return { valid: false, error: 'Tag must be a string' };
        }
        if (tag.length > MAX_TAG_LENGTH) {
            return { valid: false, error: `Tag '${tag}' exceeds max length of ${MAX_TAG_LENGTH}` };
        }
    }

    return { valid: true };
}

/**
 * Validate an array of prompts (e.g. from import)
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validateImport(data) {
    let entries;
    try {
        entries = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
        return { valid: false, errors: ['Invalid JSON format'] };
    }

    if (!Array.isArray(entries)) {
        return { valid: false, errors: ['Root element must be an array'] };
    }

    const errors = [];
    entries.forEach((prompt, index) => {
        const result = validatePrompt(prompt);
        if (!result.valid) {
            errors.push(`Item ${index}: ${result.error}`);
        }
    });

    return {
        valid: errors.length === 0,
        errors,
        data: entries // Return parsed data if valid
    };
}

// Export for CommonJS (tests/legacy) or ES modules (future)
// Using IIFE/global assignment pattern for compatibility with current setup if not module, 
// OR just CommonJS exports since we used require in other files? 
// Wait, `storage.js` used `module.exports`.
// But `popup.js` is now `type="module"`, so `lib` files should prefer ESM or be loaded as scripts.
// The current `popup.html` loads `lib/storage.js` as `<script>` (global).
// To support both, we attach to global window if module undefined.

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validatePrompt, validateImport };
} else {
    self.validatePrompt = validatePrompt;
    self.validateImport = validateImport;
}
