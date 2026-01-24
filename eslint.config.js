const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    {
        ignores: ["lib/showdown.min.js", "lib/highlight.min.js", ".loki/**", "node_modules/**"]
    },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module", // Changed from "script" to "module"
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                ...globals.node,
                // App globals
                getAllPrompts: "readonly",
                savePrompt: "readonly",
                updatePrompt: "readonly",
                deletePrompt: "readonly",
                markPromptAsUsed: "readonly",
                exportPrompts: "readonly",
                importPrompts: "readonly",
                searchPrompts: "readonly",
                getStorageInfo: "readonly",
                getPrompt: "readonly",
                validateImport: "readonly",
                validatePrompt: "readonly",
                // Libs
                showdown: "readonly",
                hljs: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }] // Ignore _prefixed args
        }
    }
];
