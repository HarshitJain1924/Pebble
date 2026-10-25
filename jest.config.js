module.exports = {
  preset: 'jest-expo',
  // Reanimated 4.7 ships a resolver that delegates to the worklets resolver and
  // additionally forces its web-only modules (e.g. `initializers`, which calls
  // `runOnUISync`) under Jest. The bare worklets resolver made those throw
  // "runOnUISync is not supported on web" at setup.
  resolver: 'react-native-reanimated/jest/resolver',
  // `transform` and `moduleNameMapper` are deliberately NOT overridden: the SDK
  // 58 preset transforms asset files (fonts/images) so `expo-font`/`expo-asset`
  // can resolve them, and maps `@/` from tsconfig paths plus React Native's
  // private entry points. Overriding either replaced the preset map wholesale
  // and produced "Module \"1\" is missing from the asset registry".
  transformIgnorePatterns: [
    // `standard-navigation` is a transitive ESM dependency of expo-router. Without it in
    // this allow-list, any suite that imports expo-router (directly or transitively) dies
    // with "Cannot use import statement outside a module" and executes ZERO tests.
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|expo-router|standard-navigation|compromise|chrono-node)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
};
