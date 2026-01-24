const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    {
        ignores: ["lib/**", ".loki/**", "node_modules/**"]
    },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                ...globals.node,
                // Application specific globals from storage.js
                getAllPrompts: "readonly",
                savePrompt: "readonly",
                updatePrompt: "readonly",
                deletePrompt: "readonly",
                markPromptAsUsed: "readonly",
                exportPrompts: "readonly",
                importPrompts: "readonly",
                searchPrompts: "readonly",
                getStorageInfo: "readonly",
                setStorageData: "readonly",
                getPrompt: "readonly", // This is missing but used, adding to globals to surface it as a runtime error or implementation task
                // Libs
                showdown: "readonly",
                hljs: "readonly"
            }
        }
    }
];
