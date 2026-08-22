// ESLint 9.x flat config format
// https://docs.expo.dev/guides/using-eslint/

const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'android/*',
      'ios/*',
      // Deno, not React Native. It has its own config (supabase/functions/
      // deno.json) and its own globals, so linting it with the Expo config
      // produced ~35 no-undef errors for `Deno`. Type-checked by
      // `deno check` and exercised by the Deno test suite instead.
      'supabase/functions/**',
      // Standalone zero-build static site, deliberately decoupled from the app
      // (see landing/README.md). Browser globals, no bundler.
      'landing/**',
      // Jest globals; the Expo config does not declare them.
      'jest.setup.js',
    ],
  },
  ...compat.extends('expo'),
  {
    // This config file itself is CommonJS run by Node, so it needs Node globals
    // declared or `npx eslint .` reports __dirname as undefined -- one of the
    // discrepancies that made the raw command unusable as a CI gate.
    files: ['eslint.config.js', 'metro.config.js', 'babel.config.js', 'app.config.js'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
      },
    },
  },
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

