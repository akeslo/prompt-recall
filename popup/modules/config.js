/**
 * Configuration and External Libraries Module
 */

// Initialize showdown converter
// Explicitly check for showdown existence to avoid reference errors during tests if mocked differently
export const converter = typeof showdown !== 'undefined'
    ? new showdown.Converter()
    : { makeHtml: (text) => text }; // Fallback for testing environment

// Configure showdown options
if (typeof showdown !== 'undefined') {
    converter.setOption('simpleLineBreaks', true);
    converter.setOption('openLinksInNewWindow', true);
    converter.setOption('excludeTrailingPunctuationFromURLs', true);
    // Security: Minimize XSS risk
    // Note: Showdown v2 'sanitize' is deprecated in favor of separate sanitizers,
    // but disabling complete HTML helps.
    converter.setOption('noHeaderId', true); // Prevents ID injection
    converter.setOption('strikethrough', true);
    converter.setOption('tables', true);
}
