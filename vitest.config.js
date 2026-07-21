import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    resolve: {
        alias: [
            // app.js and its sibling modules use root-absolute imports
            // (e.g. `/popup/modules/ui.js`, `/lib/storage.js`) because in the
            // actual extension they resolve against the extension root
            // (chrome-extension://<id>/...). Vitest/Node has no such root,
            // so map those two absolute prefixes back to the repo folders.
            { find: /^\/popup\//, replacement: path.resolve(__dirname, 'popup') + '/' },
            { find: /^\/lib\//, replacement: path.resolve(__dirname, 'lib') + '/' }
        ]
    },
    test: {
        environment: 'jsdom',
        globals: false
    }
});
