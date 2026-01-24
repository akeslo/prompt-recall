import { describe, it, expect } from 'vitest';
import { validatePrompt, validateImport } from '../lib/validator.js';

describe('Validator Module', () => {
    describe('validatePrompt', () => {
        it('should validate a correct prompt', () => {
            const prompt = {
                title: 'Valid Title',
                content: 'Valid Content',
                tags: ['tag1', 'tag2']
            };
            const result = validatePrompt(prompt);
            expect(result.valid).toBe(true);
        });

        it('should fail if title is missing or not a string', () => {
            expect(validatePrompt({ content: 'C', tags: [] }).valid).toBe(false);
            expect(validatePrompt({ title: 123, content: 'C', tags: [] }).valid).toBe(false);
        });

        it('should fail if title is too long', () => {
            const longTitle = 'a'.repeat(101);
            const result = validatePrompt({ title: longTitle, content: 'C', tags: [] });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Title exceeds max length');
        });

        it('should fail if content is empty or not a string', () => {
            expect(validatePrompt({ title: 'T', content: '', tags: [] }).valid).toBe(false);
            expect(validatePrompt({ title: 'T', content: 123, tags: [] }).valid).toBe(false);
        });

        it('should fail if tags are invalid', () => {
            expect(validatePrompt({ title: 'T', content: 'C', tags: 'not-array' }).valid).toBe(false);
            expect(validatePrompt({ title: 'T', content: 'C', tags: ['a'.repeat(31)] }).valid).toBe(false);
        });
    });

    describe('validateImport', () => {
        it('should validate a correct JSON array', () => {
            const data = [
                { title: 'P1', content: 'C1', tags: [] },
                { title: 'P2', content: 'C2', tags: ['t1'] }
            ];
            const result = validateImport(JSON.stringify(data));
            expect(result.valid).toBe(true);
            expect(result.data).toHaveLength(2);
        });

        it('should fail if root is not an array', () => {
            const result = validateImport(JSON.stringify({ title: 'P1' }));
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toBe('Root element must be an array');
        });

        it('should identify errors in specific items', () => {
            const data = [
                { title: 'P1', content: 'C1', tags: [] },
                { title: '', content: '', tags: [] } // Invalid
            ];
            const result = validateImport(data);
            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain('Item 1');
        });

        it('should fail on invalid JSON', () => {
            const result = validateImport('invalid-json');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toBe('Invalid JSON format');
        });
    });
});
