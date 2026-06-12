import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['coverage/**', 'node_modules/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        AbortController: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-console': ['error', { allow: ['error'] }],
    },
  },
];
