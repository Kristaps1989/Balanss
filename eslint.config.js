// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Colours come from the theme (src/theme/palettes.ts) so both themes stay complete.
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**', 'app/(tabs)/nutrition/camera.tsx', 'app/(tabs)/nutrition/analyzing.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Literal[value=/^#[0-9A-Fa-f]{3,8}$/]', message: 'Use a theme colour (colors.*) instead of a raw hex value.' },
      ],
    },
  },
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'prototype/*', 'backend/*', '.claude/*', 'dist-e2e/*', 'e2e-report/*', 'test-results/*'],
  },
]);
