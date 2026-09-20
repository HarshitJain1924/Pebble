// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const noRawHexColors = require('./tools/eslint/no-raw-hex-colors');

/**
 * The only modules allowed to contain raw color values: they are the
 * single source of truth for theming (see their file headers).
 */
const COLOR_TOKEN_FILES = [
  'shared/constants/theme.ts',
  'shared/constants/categoryColors.ts',
];

module.exports = defineConfig([
  expoConfig,
  {
    // Build output plus the AI-agent workspace, which is not shipped and is
    // excluded from version control (see .gitignore). ESLint does not read
    // .gitignore, so it has to be listed here explicitly.
    ignores: ['dist/*', '.gemini/**'],
  },
  {
    // Themable surfaces — app routes, feature modules and shared UI.
    files: [
      'app/**/*.{js,jsx,ts,tsx}',
      'features/**/*.{js,jsx,ts,tsx}',
      'shared/**/*.{js,jsx,ts,tsx}',
    ],
    ignores: [
      '**/__tests__/**',
      '**/__mocks__/**',
      '**/*.test.*',
      '**/*.spec.*',
      ...COLOR_TOKEN_FILES,
    ],
    plugins: {
      pebble: {
        rules: {
          'no-raw-hex-colors': noRawHexColors,
        },
      },
    },
    rules: {
      'pebble/no-raw-hex-colors': 'error',
    },
  },
]);
