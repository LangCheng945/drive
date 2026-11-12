import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
export default ts.config(
  { ignores: ['.svelte-kit/**', 'node_modules/**', '.wrangler/**', 'build/**', 'coverage/**'] },
  js.configs.recommended, ...ts.configs.recommended, ...svelte.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node, FixedLengthStream: 'readonly' } }, rules: { 'svelte/no-navigation-without-resolve': 'off' } },
  { files: ['**/*.svelte'], languageOptions: { parserOptions: { parser: ts.parser } } }
);
