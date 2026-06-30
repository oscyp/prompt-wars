// ESLint 9.x flat config format
// https://docs.expo.dev/guides/using-eslint/

const { FlatCompat } = require('@eslint/eslintrc');
const path = require('path');

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'android/*', 'ios/*'],
  },
  ...compat.extends('expo'),
  {
    // Node-only build/tooling scripts (not bundled into the app).
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
];

