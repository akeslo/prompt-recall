import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPopupDom } from './fixtures/dom-fixture.js';

// Mock chrome global — same shape as tests/storage.test.js, extended with
// the alarms/runtime bits app.js itself calls (storage.js only needs
// storage.sync/local).
global.chrome = {
    runtime: {
        lastError: null,
        getManifest: vi.fn(() => ({ version: '0.0.0-test' })),
        sendMessage: vi.fn()
    },
    alarms: {
        clear: vi.fn(),
        create: vi.fn()
    },
    storage: {
        sync: {
            get: vi.fn(),
            set: vi.fn(),
            remove: vi.fn(),
            QUOTA_BYTES: 102400,
            getBytesInUse: vi.fn()
        },
        local: {
            get: vi.fn((_keys, cb) => cb({})),
            set: vi.fn((_data, cb) => cb && cb()),
            remove: vi.fn((_keys, cb) => cb && cb()),
            getBytesInUse: vi.fn()
        },
        onChanged: { addListener: vi.fn() }
    }
};

// app.js/ui.js build their DOM references at *import* time, so the fixture
// must be in place before the first (dynamic) import.
buildPopupDom();

const ui = await import('../popup/modules/ui.js');
const { state } = await import('../popup/modules/state.js');
const app = await import('../popup/modules/app.js');

const { elements } = ui;

function makePrompt(overrides = {}) {
    return {
        id: 'p1',
        title: 'Sample Prompt',
        content: 'Hello {{name}}',
        tags: [],
        pinned: false,
        locked: false,
        useCount: 0,
        createdAt: Date.now(),
        lastUsed: null,
        variants: [],
        hasMedia: false,
        ...overrides
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    state.currentPrompts = [];
    state.allPrompts = [];
    state.pendingAction = null;
    state.activeTagFilter = null;
    state.sortDirection = 'desc';
    elements.searchInput.value = '';
    elements.sortSelect.value = 'recent';
});

describe('extractVariables', () => {
    it('extracts a single {{variable}}', () => {
        expect(app.extractVariables('Hello {{name}}')).toEqual(['name']);
    });

    it('extracts multiple variables in order of first appearance', () => {
        expect(app.extractVariables('{{a}} and {{b}} and {{a}}')).toEqual(['a', 'b']);
    });

    it('trims whitespace inside the braces', () => {
        expect(app.extractVariables('{{  spaced  }}')).toEqual(['spaced']);
    });

    it('returns an empty array when there are no variables', () => {
        expect(app.extractVariables('No variables here.')).toEqual([]);
    });

    it('dedupes repeated variables', () => {
        expect(app.extractVariables('{{x}} {{x}} {{x}}')).toEqual(['x']);
    });
});

describe('processVariables', () => {
    it('does nothing when there is no pending action', () => {
        state.pendingAction = null;
        elements.variableModal.dataset.templateContent = 'Hello {{name}}';
        expect(() => app.processVariables()).not.toThrow();
    });

    it('substitutes each input value into the template and invokes pendingAction', () => {
        elements.variableModal.dataset.templateContent = 'Hi {{name}}, you are {{age}}.';
        elements.variableInputs.innerHTML = `
            <input class="variable-input" data-variable="name" value="Kes" />
            <input class="variable-input" data-variable="age" value="99" />
        `;

        let received = null;
        state.pendingAction = (finalContent) => { received = finalContent; };

        app.processVariables();

        expect(received).toBe('Hi Kes, you are 99.');
    });

    it('replaces every occurrence of a repeated variable', () => {
        elements.variableModal.dataset.templateContent = '{{x}}-{{x}}-{{x}}';
        elements.variableInputs.innerHTML = `<input class="variable-input" data-variable="x" value="Z" />`;

        let received = null;
        state.pendingAction = (finalContent) => { received = finalContent; };

        app.processVariables();

        expect(received).toBe('Z-Z-Z');
    });

    it('falls back to empty string for a blank input value', () => {
        elements.variableModal.dataset.templateContent = 'Value: [{{v}}]';
        elements.variableInputs.innerHTML = `<input class="variable-input" data-variable="v" value="" />`;

        let received = null;
        state.pendingAction = (finalContent) => { received = finalContent; };

        app.processVariables();

        expect(received).toBe('Value: []');
    });

    it('clears pendingAction and hides the modal after running', () => {
        elements.variableModal.dataset.templateContent = 'Hi {{name}}';
        elements.variableInputs.innerHTML = `<input class="variable-input" data-variable="name" value="Kes" />`;
        elements.variableModal.style.display = 'flex';
        state.pendingAction = () => {};

        app.processVariables();

        expect(state.pendingAction).toBeNull();
        expect(elements.variableModal.style.display).toBe('none');
    });
});

describe('applyFiltersAndSort', () => {
    // All cases below leave the search box empty so the function takes the
    // `state.allPrompts` branch directly and never calls into storage.js /
    // chrome.storage — keeping this a pure test of the filter/sort logic.

    it('defaults to newest-first ("recent") when no other sort is picked', async () => {
        state.allPrompts = [
            makePrompt({ id: 'old', createdAt: 100 }),
            makePrompt({ id: 'new', createdAt: 200 })
        ];
        elements.sortSelect.value = 'recent';

        await app.applyFiltersAndSort();

        expect(state.currentPrompts.map(p => p.id)).toEqual(['new', 'old']);
    });

    it('sorts alphabetically by title', async () => {
        state.allPrompts = [
            makePrompt({ id: 'b', title: 'Banana' }),
            makePrompt({ id: 'a', title: 'Apple' })
        ];
        elements.sortSelect.value = 'alphabetical';

        await app.applyFiltersAndSort();

        expect(state.currentPrompts.map(p => p.id)).toEqual(['a', 'b']);
    });

    it('reverses order when sortDirection is "asc"', async () => {
        state.allPrompts = [
            makePrompt({ id: 'b', title: 'Banana' }),
            makePrompt({ id: 'a', title: 'Apple' })
        ];
        elements.sortSelect.value = 'alphabetical';
        state.sortDirection = 'asc';

        await app.applyFiltersAndSort();

        expect(state.currentPrompts.map(p => p.id)).toEqual(['b', 'a']);
    });

    it('sorts pinned prompts to the top regardless of sort key (except favorites/byTag)', async () => {
        state.allPrompts = [
            makePrompt({ id: 'unpinned', createdAt: 300, pinned: false }),
            makePrompt({ id: 'pinned', createdAt: 100, pinned: true })
        ];
        elements.sortSelect.value = 'recent';

        await app.applyFiltersAndSort();

        expect(state.currentPrompts.map(p => p.id)).toEqual(['pinned', 'unpinned']);
    });

    it('filters to only favorites when sortBy is "favorites"', async () => {
        state.allPrompts = [
            makePrompt({ id: 'fav', pinned: true }),
            makePrompt({ id: 'not-fav', pinned: false })
        ];
        elements.sortSelect.value = 'favorites';

        await app.applyFiltersAndSort();

        expect(state.currentPrompts.map(p => p.id)).toEqual(['fav']);
    });

    it('filters by the active tag filter', async () => {
        state.allPrompts = [
            makePrompt({ id: 'tagged', tags: ['coding'] }),
            makePrompt({ id: 'untagged', tags: [] })
        ];
        state.activeTagFilter = 'coding';
        elements.sortSelect.value = 'recent';

        await app.applyFiltersAndSort();

        expect(state.currentPrompts.map(p => p.id)).toEqual(['tagged']);
    });

    it('sorts by most used', async () => {
        state.allPrompts = [
            makePrompt({ id: 'low', useCount: 1 }),
            makePrompt({ id: 'high', useCount: 9 })
        ];
        elements.sortSelect.value = 'mostUsed';

        await app.applyFiltersAndSort();

        expect(state.currentPrompts.map(p => p.id)).toEqual(['high', 'low']);
    });

    it('sorts by last used, pushing never-used prompts to the end', async () => {
        state.allPrompts = [
            makePrompt({ id: 'never', lastUsed: null }),
            makePrompt({ id: 'recent-use', lastUsed: 500 }),
            makePrompt({ id: 'older-use', lastUsed: 100 })
        ];
        elements.sortSelect.value = 'lastUsed';

        await app.applyFiltersAndSort();

        expect(state.currentPrompts.map(p => p.id)).toEqual(['recent-use', 'older-use', 'never']);
    });

    it('sorts by tag then title when sortBy is "byTag"', async () => {
        state.allPrompts = [
            makePrompt({ id: 'z-coding', title: 'Zeta', tags: ['coding'] }),
            makePrompt({ id: 'a-coding', title: 'Alpha', tags: ['coding'] }),
            makePrompt({ id: 'no-tag', title: 'Middle', tags: [] })
        ];
        elements.sortSelect.value = 'byTag';

        await app.applyFiltersAndSort();

        // tagged prompts sort by tag first (alpha before zeta), then title;
        // untagged prompts (tag treated as ￿) sort last.
        expect(state.currentPrompts.map(p => p.id)).toEqual(['a-coding', 'z-coding', 'no-tag']);
    });
});

describe('renderPrompts', () => {
    it('shows the empty state and clears the list when there are no prompts', () => {
        state.currentPrompts = [];
        elements.promptsList.innerHTML = '<div>stale</div>';

        app.renderPrompts();

        expect(elements.emptyState.style.display).toBe('flex');
        expect(elements.promptsList.style.display).toBe('none');
        expect(elements.promptsList.innerHTML).toBe('');
    });

    it('renders one card per prompt and hides the empty state', () => {
        state.currentPrompts = [makePrompt({ id: 'a' }), makePrompt({ id: 'b' })];

        app.renderPrompts();

        expect(elements.emptyState.style.display).toBe('none');
        expect(elements.promptsList.style.display).toBe('block');
        expect(elements.promptsList.querySelectorAll('.prompt-card')).toHaveLength(2);
        expect(elements.promptsList.querySelector('[data-prompt-id="a"]')).not.toBeNull();
        expect(elements.promptsList.querySelector('[data-prompt-id="b"]')).not.toBeNull();
    });
});

describe('createPromptCard', () => {
    it('builds a card carrying the prompt id and title', () => {
        const card = app.createPromptCard(makePrompt({ id: 'p42', title: 'My Title' }));

        expect(card.className).toContain('prompt-card');
        expect(card.dataset.promptId).toBe('p42');
        expect(card.querySelector('.prompt-title').textContent).toContain('My Title');
    });

    it('falls back to "Untitled" when the prompt has no title', () => {
        const card = app.createPromptCard(makePrompt({ title: '' }));
        expect(card.querySelector('.prompt-title').textContent).toContain('Untitled');
    });

    it('marks pinned prompts with the pinned class on the card and pin button', () => {
        const card = app.createPromptCard(makePrompt({ pinned: true }));
        expect(card.className).toContain('pinned');
        expect(card.querySelector('.pin-btn').className).toContain('pinned');
    });

    it('renders one .tag element per tag', () => {
        const card = app.createPromptCard(makePrompt({ tags: ['coding', 'writing'] }));
        const tagEls = card.querySelectorAll('.tag');
        expect([...tagEls].map(el => el.textContent)).toEqual(['coding', 'writing']);
    });

    it('shows a variant badge with the total variant count (primary + variants)', () => {
        const card = app.createPromptCard(makePrompt({
            variants: [{ label: 'Shorter', content: 'x' }, { label: 'Formal', content: 'y' }]
        }));
        const badge = card.querySelector('.variant-badge');
        expect(badge).not.toBeNull();
        expect(badge.textContent).toBe('3'); // primary + 2 variants
    });

    it('omits the variant badge when there are no variants', () => {
        const card = app.createPromptCard(makePrompt({ variants: [] }));
        expect(card.querySelector('.variant-badge')).toBeNull();
    });

    it('includes the use count in the meta text when the prompt has been used', () => {
        const card = app.createPromptCard(makePrompt({ useCount: 5 }));
        expect(card.querySelector('.meta-text').textContent).toContain('5x');
    });
});
